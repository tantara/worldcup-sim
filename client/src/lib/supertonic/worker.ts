/**
 * Dedicated Web Worker that runs the Supertonic TTS engine off the main thread,
 * so model download, inference, and WAV encoding never block the UI.
 *
 * Protocol:
 *   main → worker:  { type: "synthesize", reqId, text, lang, voiceId, totalStep, speed }
 *   worker → main:  { type: "progress", reqId, label, current, total }   (model load)
 *                   { type: "ready",    reqId, backend }
 *                   { type: "result",   reqId, sampleRate, wav: ArrayBuffer } (transferred)
 *                   { type: "error",    reqId, message }
 *
 * Requests are processed one at a time. A newer request supersedes older ones:
 * queued duplicates are dropped, and an in-flight synthesis aborts at the next
 * denoising-step boundary so we never waste GPU/CPU on stale audio.
 */
import * as ort from "onnxruntime-web/webgpu";

import {
  loadTextToSpeech,
  loadVoiceStyle,
  writeWavFile,
  type Style,
  type TextToSpeech,
} from "./engine";
import { SUPERTONIC_ASSET_BASE, voiceStyleUrl } from "./voices";

// Single-threaded WASM avoids the COOP/COEP cross-origin-isolation requirement,
// so the page needs no special security headers to run the engine.
ort.env.wasm.numThreads = 1;
// The onnxruntime-web bundle loads its `.wasm` binary at runtime rather than
// inlining it. Pin the path to jsDelivr (CORS `*`, `application/wasm`) so the
// runtime loads deterministically in production instead of depending on how the
// OpenNext/Cloudflare build emits and serves bundled worker assets.
// NOTE: keep the version in sync with `onnxruntime-web` in package.json.
ort.env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/";

interface SynthesizeMsg {
  type: "synthesize";
  reqId: number;
  text: string;
  lang: string;
  voiceId: string;
  totalStep: number;
  speed: number;
}

type OutMsg =
  | { type: "progress"; reqId: number; label: string; current: number; total: number }
  | { type: "ready"; reqId: number; backend: string }
  | { type: "result"; reqId: number; sampleRate: number; wav: ArrayBuffer }
  | { type: "error"; reqId: number; message: string };

// Minimal worker-scope typing (avoids pulling the conflicting "webworker" lib).
interface WorkerScope {
  postMessage(message: OutMsg, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<SynthesizeMsg>) => void) | null;
}
const ctx = self as unknown as WorkerScope;

function post(message: OutMsg, transfer?: Transferable[]): void {
  ctx.postMessage(message, transfer);
}

let enginePromise: Promise<{ tts: TextToSpeech; backend: string }> | null = null;
const styles = new Map<string, Style>();

// The most recent request id; anything older is considered superseded.
let latestReqId = 0;
const queue: SynthesizeMsg[] = [];
let processing = false;

async function ensureEngine(
  reqId: number,
): Promise<{ tts: TextToSpeech; backend: string }> {
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    const onProgress = (label: string, current: number, total: number) =>
      post({ type: "progress", reqId, label, current, total });

    try {
      const result = await loadTextToSpeech(
        ort,
        SUPERTONIC_ASSET_BASE,
        { executionProviders: ["webgpu"], graphOptimizationLevel: "all" },
        onProgress,
      );
      return { tts: result.textToSpeech, backend: "WebGPU" };
    } catch {
      const result = await loadTextToSpeech(
        ort,
        SUPERTONIC_ASSET_BASE,
        { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
        onProgress,
      );
      return { tts: result.textToSpeech, backend: "WebAssembly" };
    }
  })().catch((err: unknown) => {
    enginePromise = null; // allow a later retry
    throw err;
  });

  return enginePromise;
}

async function ensureStyle(voiceId: string): Promise<Style> {
  const cached = styles.get(voiceId);
  if (cached) return cached;
  const style = await loadVoiceStyle(
    ort,
    voiceStyleUrl(SUPERTONIC_ASSET_BASE, voiceId),
  );
  styles.set(voiceId, style);
  return style;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0) {
      const msg = queue.shift()!;
      if (msg.reqId !== latestReqId) continue; // superseded while queued

      try {
        const { tts, backend } = await ensureEngine(msg.reqId);
        post({ type: "ready", reqId: msg.reqId, backend });

        const style = await ensureStyle(msg.voiceId);

        // Abort at the next step boundary if a newer request has arrived.
        const onStep = () => {
          if (msg.reqId !== latestReqId) {
            throw new DOMException("superseded", "AbortError");
          }
        };

        const { wav, duration } = await tts.call(
          msg.text,
          msg.lang,
          style,
          msg.totalStep,
          msg.speed,
          0.3,
          onStep,
        );

        if (msg.reqId !== latestReqId) continue; // superseded during synthesis

        const wavLen = Math.floor(tts.sampleRate * (duration[0] ?? 0));
        const buffer = writeWavFile(wav.slice(0, wavLen), tts.sampleRate);
        post(
          { type: "result", reqId: msg.reqId, sampleRate: tts.sampleRate, wav: buffer },
          [buffer],
        );
      } catch (err) {
        if (isAbort(err)) continue; // expected when superseded
        post({
          type: "error",
          reqId: msg.reqId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    processing = false;
  }
}

ctx.onmessage = (event: MessageEvent<SynthesizeMsg>) => {
  const msg = event.data;
  if (msg.type !== "synthesize") return;
  latestReqId = msg.reqId;
  queue.push(msg);
  void processQueue();
};
