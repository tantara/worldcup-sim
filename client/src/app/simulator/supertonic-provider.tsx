"use client";

/**
 * Client-only context for the in-browser Supertonic TTS used in the simulator:
 * capability detection, the selected voice/language, and per-bubble synthesis +
 * playback.
 *
 * All heavy work (model download, ONNX inference, WAV encoding) runs in a
 * dedicated Web Worker (`~/lib/supertonic/worker`), so generating audio never
 * blocks the UI or other operations. The main thread only spawns the worker,
 * posts requests, and plays the returned audio through a single shared
 * <audio> element — guaranteeing exactly one clip plays at a time.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DEFAULT_LANG, DEFAULT_VOICE_ID } from "~/lib/supertonic/voices";

type EngineStatus = "idle" | "loading" | "ready" | "error";

interface LoadProgress {
  label: string;
  current: number;
  total: number;
}

// Messages emitted by the worker (kept in sync with worker.ts).
type WorkerMsg =
  | { type: "progress"; reqId: number; label: string; current: number; total: number }
  | { type: "ready"; reqId: number; backend: string }
  | { type: "result"; reqId: number; sampleRate: number; wav: ArrayBuffer }
  | { type: "error"; reqId: number; message: string };

interface SupertonicContextValue {
  /** null while detecting, then whether the engine can run in this browser. */
  supported: boolean | null;
  voiceId: string;
  setVoiceId: (id: string) => void;
  lang: string;
  setLang: (code: string) => void;
  engineStatus: EngineStatus;
  loadProgress: LoadProgress | null;
  /** Backend in use once loaded ("WebGPU" | "WebAssembly"). */
  backend: string | null;
  error: string | null;
  /** Bubble id currently producing audio (downloading model / synthesising). */
  busyId: string | null;
  /** Bubble id currently playing audio. */
  playingId: string | null;
  /** Toggle: synthesise (if needed) and play `text` for bubble `id`. */
  play: (id: string, text: string) => void;
  stop: () => void;
}

const SupertonicContext = createContext<SupertonicContextValue | null>(null);

export function useSupertonic(): SupertonicContextValue {
  const ctx = useContext(SupertonicContext);
  if (!ctx) {
    throw new Error("useSupertonic must be used within <SupertonicProvider>");
  }
  return ctx;
}

interface RequestMeta {
  bubbleId: string;
  cacheKey: string;
}

export function SupertonicProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [lang, setLang] = useState(DEFAULT_LANG);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("idle");
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Synthesised WAV object URLs, keyed by `${voiceId}:${lang}:${text}`.
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  // In-flight / completed request metadata, keyed by request id.
  const requestMetaRef = useRef<Map<number, RequestMeta>>(new Map());
  // Monotonic request counter; only the latest request controls playback.
  const seqRef = useRef(0);

  const playUrl = useCallback((url: string, bubbleId: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = url;
    void audio.play().then(
      () => setPlayingId(bubbleId),
      (err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
    );
  }, []);

  // Spawn the worker + shared audio element after mount (browser only). Doing
  // capability detection here keeps SSR and first client render in agreement
  // (both render `supported === null`, hiding the controls until hydration).
  useEffect(() => {
    const canRun =
      typeof WebAssembly === "object" && typeof Worker !== "undefined";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client capability probe; must run post-mount to match SSR
    setSupported(canRun);
    if (!canRun) return;

    const audio = new Audio();
    audio.onended = () => setPlayingId(null);
    audioRef.current = audio;

    const worker = new Worker(
      new URL("../../lib/supertonic/worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerMsg>) => {
      const msg = event.data;
      switch (msg.type) {
        case "progress":
          setEngineStatus("loading");
          setLoadProgress({
            label: msg.label,
            current: msg.current,
            total: msg.total,
          });
          break;
        case "ready":
          setBackend(msg.backend);
          setEngineStatus("ready");
          setLoadProgress(null);
          break;
        case "result": {
          const meta = requestMetaRef.current.get(msg.reqId);
          requestMetaRef.current.delete(msg.reqId);
          const url = URL.createObjectURL(
            new Blob([msg.wav], { type: "audio/wav" }),
          );
          if (!meta) {
            URL.revokeObjectURL(url);
            break;
          }
          audioCacheRef.current.set(meta.cacheKey, url);
          // Only the latest request drives playback; older results are cached
          // for instant replay but don't hijack the current selection.
          if (msg.reqId === seqRef.current) {
            setBusyId(null);
            playUrl(url, meta.bubbleId);
          }
          break;
        }
        case "error":
          requestMetaRef.current.delete(msg.reqId);
          if (msg.reqId === seqRef.current) {
            setBusyId(null);
            setError(msg.message);
          }
          break;
      }
    };

    const cache = audioCacheRef.current;
    const metas = requestMetaRef.current;
    return () => {
      worker.terminate();
      workerRef.current = null;
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
      metas.clear();
    };
  }, [playUrl]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlayingId(null);
  }, []);

  const play = useCallback(
    (id: string, text: string) => {
      if (supported !== true) return;

      // Clicking the active bubble again stops it.
      if (playingId === id) {
        stop();
        return;
      }

      const audio = audioRef.current;
      const worker = workerRef.current;
      if (!audio || !worker) return;

      // Stop whatever is playing — only one clip is ever audible.
      audio.pause();
      setPlayingId(null);
      setError(null);

      const trimmed = text.trim();
      if (!trimmed) return;

      const cacheKey = `${voiceId}:${lang}:${trimmed}`;
      const reqId = ++seqRef.current;

      const cachedUrl = audioCacheRef.current.get(cacheKey);
      if (cachedUrl) {
        setBusyId(null);
        playUrl(cachedUrl, id);
        return;
      }

      requestMetaRef.current.set(reqId, { bubbleId: id, cacheKey });
      setBusyId(id);
      // Off-thread: posting returns immediately, the UI stays responsive.
      worker.postMessage({
        type: "synthesize",
        reqId,
        text: trimmed,
        lang,
        voiceId,
        totalStep: 8,
        speed: 1.05,
      });
    },
    [supported, playingId, voiceId, lang, stop, playUrl],
  );

  const value = useMemo<SupertonicContextValue>(
    () => ({
      supported,
      voiceId,
      setVoiceId,
      lang,
      setLang,
      engineStatus,
      loadProgress,
      backend,
      error,
      busyId,
      playingId,
      play,
      stop,
    }),
    [
      supported,
      voiceId,
      lang,
      engineStatus,
      loadProgress,
      backend,
      error,
      busyId,
      playingId,
      play,
      stop,
    ],
  );

  return (
    <SupertonicContext.Provider value={value}>
      {children}
    </SupertonicContext.Provider>
  );
}
