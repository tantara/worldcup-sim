/**
 * In-browser Supertonic 3 text-to-speech engine.
 *
 * Ported from the upstream `supertonic/web/helper.js` reference. Logic is kept
 * intentionally close to the original; the differences are:
 *  - typed for TypeScript,
 *  - the `onnxruntime-web` module is injected (`ort`) rather than statically
 *    imported, so this file never pulls the heavy/browser-only runtime into the
 *    SSR or edge bundle,
 *  - asset URLs are built from a configurable base (we point it at the
 *    HuggingFace CDN), and
 *  - text is tokenised by Unicode code point instead of UTF-16 code unit, so
 *    supplementary-plane characters index correctly.
 */
import type * as Ort from "onnxruntime-web";

type OrtModule = typeof import("onnxruntime-web");
type Tensor = Ort.Tensor;
type InferenceSession = Ort.InferenceSession;

// Available languages for multilingual TTS (matches the upstream indexer).
export const AVAILABLE_LANGS = [
  "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi",
  "fr", "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro",
  "ru", "sk", "sl", "sv", "tr", "uk", "vi", "na",
] as const;

export function isValidLang(lang: string): boolean {
  return (AVAILABLE_LANGS as readonly string[]).includes(lang);
}

/** Unicode text processor: normalises text and maps code points to token ids. */
export class UnicodeProcessor {
  constructor(private readonly indexer: number[]) {}

  call(
    textList: string[],
    langList: string[],
  ): { textIds: number[][]; textMask: number[][][] } {
    // Tokenise by code point (Array.from splits on code points, not UTF-16
    // units) so astral-plane characters index correctly.
    const processed = textList.map((text, i) =>
      Array.from(this.preprocessText(text, langList[i] ?? "en")),
    );

    const lengths = processed.map((chars) => chars.length);
    const maxLen = Math.max(...lengths);

    const textIds = processed.map((chars) => {
      const row = new Array<number>(maxLen).fill(0);
      for (let j = 0; j < chars.length; j++) {
        const codePoint = chars[j]!.codePointAt(0) ?? 0;
        row[j] = codePoint < this.indexer.length ? this.indexer[codePoint]! : -1;
      }
      return row;
    });

    const textMask = this.getTextMask(lengths);
    return { textIds, textMask };
  }

  preprocessText(text: string, lang: string): string {
    // TODO: Need advanced normalizer for better performance
    text = text.normalize("NFKD");

    // Remove emojis (wide Unicode range)
    const emojiPattern =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
    text = text.replace(emojiPattern, "");

    // Replace various dashes and symbols
    const replacements: Record<string, string> = {
      "–": "-",
      "‑": "-",
      "—": "-",
      _: " ",
      "“": '"', // left double quote
      "”": '"', // right double quote
      "‘": "'", // left single quote
      "’": "'", // right single quote
      "´": "'",
      "`": "'",
      "[": " ",
      "]": " ",
      "|": " ",
      "/": " ",
      "#": " ",
      "→": " ",
      "←": " ",
    };
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replaceAll(k, v);
    }

    // Remove special symbols
    text = text.replace(/[♥☆♡©\\]/g, "");

    // Replace known expressions
    const exprReplacements: Record<string, string> = {
      "@": " at ",
      "e.g.,": "for example, ",
      "i.e.,": "that is, ",
    };
    for (const [k, v] of Object.entries(exprReplacements)) {
      text = text.replaceAll(k, v);
    }

    // Fix spacing around punctuation
    text = text.replace(/ ,/g, ",");
    text = text.replace(/ \./g, ".");
    text = text.replace(/ !/g, "!");
    text = text.replace(/ \?/g, "?");
    text = text.replace(/ ;/g, ";");
    text = text.replace(/ :/g, ":");
    text = text.replace(/ '/g, "'");

    // Remove duplicate quotes
    while (text.includes('""')) text = text.replace('""', '"');
    while (text.includes("''")) text = text.replace("''", "'");
    while (text.includes("``")) text = text.replace("``", "`");

    // Remove extra spaces
    text = text.replace(/\s+/g, " ").trim();

    // If text doesn't end with punctuation/quotes/closing brackets, add a period
    if (!/[.!?;:,'")\]}…。」』】〉》›»]$/.test(text)) {
      text += ".";
    }

    if (!isValidLang(lang)) {
      throw new Error(
        `Invalid language: ${lang}. Available: ${AVAILABLE_LANGS.join(", ")}`,
      );
    }

    // Wrap text with language tags
    return `<${lang}>${text}</${lang}>`;
  }

  getTextMask(textIdsLengths: number[]): number[][][] {
    const maxLen = Math.max(...textIdsLengths);
    return lengthToMask(textIdsLengths, maxLen);
  }
}

/** Holds the per-voice style tensors (text-to-latent + duration predictor). */
export class Style {
  constructor(
    readonly ttl: Tensor,
    readonly dp: Tensor,
  ) {}
}

export interface TtsConfig {
  ae: { sample_rate: number; base_chunk_size: number };
  ttl: { chunk_compress_factor: number; latent_dim: number };
}

export type ProgressCallback = (step: number, total: number) => void;

/** Text-to-speech inference pipeline over four ONNX models. */
export class TextToSpeech {
  readonly sampleRate: number;

  constructor(
    private readonly cfgs: TtsConfig,
    private readonly textProcessor: UnicodeProcessor,
    private readonly dpOrt: InferenceSession,
    private readonly textEncOrt: InferenceSession,
    private readonly vectorEstOrt: InferenceSession,
    private readonly vocoderOrt: InferenceSession,
    private readonly ort: OrtModule,
  ) {
    this.sampleRate = cfgs.ae.sample_rate;
  }

  private async _infer(
    textList: string[],
    langList: string[],
    style: Style,
    totalStep: number,
    speed = 1.05,
    progressCallback: ProgressCallback | null = null,
  ): Promise<{ wav: number[]; duration: number[] }> {
    const ort = this.ort;
    const bsz = textList.length;

    const { textIds, textMask } = this.textProcessor.call(textList, langList);

    const textIdsFlat = new BigInt64Array(textIds.flat().map((x) => BigInt(x)));
    const textIdsShape = [bsz, textIds[0]!.length];
    const textIdsTensor = new ort.Tensor("int64", textIdsFlat, textIdsShape);

    const textMaskFlat = new Float32Array(textMask.flat(2));
    const textMaskShape = [bsz, 1, textMask[0]![0]!.length];
    const textMaskTensor = new ort.Tensor("float32", textMaskFlat, textMaskShape);

    // Predict duration
    const dpOutputs = await this.dpOrt.run({
      text_ids: textIdsTensor,
      style_dp: style.dp,
      text_mask: textMaskTensor,
    });
    const duration = Array.from(dpOutputs.duration!.data as Float32Array);
    for (let i = 0; i < duration.length; i++) duration[i]! /= speed;

    // Encode text
    const textEncOutputs = await this.textEncOrt.run({
      text_ids: textIdsTensor,
      style_ttl: style.ttl,
      text_mask: textMaskTensor,
    });
    const textEmb = textEncOutputs.text_emb!;

    // Sample noisy latent
    const { xt: initialXt, latentMask } = this.sampleNoisyLatent(
      duration,
      this.sampleRate,
      this.cfgs.ae.base_chunk_size,
      this.cfgs.ttl.chunk_compress_factor,
      this.cfgs.ttl.latent_dim,
    );
    let xt = initialXt;

    const latentMaskFlat = new Float32Array(latentMask.flat(2));
    const latentMaskShape = [bsz, 1, latentMask[0]![0]!.length];
    const latentMaskTensor = new ort.Tensor(
      "float32",
      latentMaskFlat,
      latentMaskShape,
    );

    const totalStepArray = new Float32Array(bsz).fill(totalStep);
    const totalStepTensor = new ort.Tensor("float32", totalStepArray, [bsz]);

    // Denoising loop
    for (let step = 0; step < totalStep; step++) {
      progressCallback?.(step + 1, totalStep);

      const currentStepArray = new Float32Array(bsz).fill(step);
      const currentStepTensor = new ort.Tensor("float32", currentStepArray, [
        bsz,
      ]);

      const xtFlat = new Float32Array(xt.flat(2));
      const xtShape = [bsz, xt[0]!.length, xt[0]![0]!.length];
      const xtTensor = new ort.Tensor("float32", xtFlat, xtShape);

      const vectorEstOutputs = await this.vectorEstOrt.run({
        noisy_latent: xtTensor,
        text_emb: textEmb,
        style_ttl: style.ttl,
        latent_mask: latentMaskTensor,
        text_mask: textMaskTensor,
        current_step: currentStepTensor,
        total_step: totalStepTensor,
      });

      const denoised = Array.from(
        vectorEstOutputs.denoised_latent!.data as Float32Array,
      );

      // Reshape flat output back to [bsz, latentDim, latentLen]
      const latentDim = xt[0]!.length;
      const latentLen = xt[0]![0]!.length;
      xt = [];
      let idx = 0;
      for (let b = 0; b < bsz; b++) {
        const batch: number[][] = [];
        for (let d = 0; d < latentDim; d++) {
          const row: number[] = [];
          for (let t = 0; t < latentLen; t++) row.push(denoised[idx++]!);
          batch.push(row);
        }
        xt.push(batch);
      }
    }

    // Generate waveform
    const finalXtFlat = new Float32Array(xt.flat(2));
    const finalXtShape = [bsz, xt[0]!.length, xt[0]![0]!.length];
    const finalXtTensor = new ort.Tensor("float32", finalXtFlat, finalXtShape);

    const vocoderOutputs = await this.vocoderOrt.run({ latent: finalXtTensor });
    const wav = Array.from(vocoderOutputs.wav_tts!.data as Float32Array);

    return { wav, duration };
  }

  /** Synthesise a single utterance, chunking long text with natural pauses. */
  async call(
    text: string,
    lang: string,
    style: Style,
    totalStep: number,
    speed = 1.05,
    silenceDuration = 0.3,
    progressCallback: ProgressCallback | null = null,
  ): Promise<{ wav: number[]; duration: number[] }> {
    if (style.ttl.dims[0] !== 1) {
      throw new Error("Single speaker text to speech only supports single style");
    }
    const maxLen = lang === "ko" || lang === "ja" ? 120 : 300;
    const textList = chunkText(text, maxLen);
    const langList = new Array<string>(textList.length).fill(lang);
    let wavCat: number[] = [];
    let durCat = 0;

    for (let i = 0; i < textList.length; i++) {
      const { wav, duration } = await this._infer(
        [textList[i]!],
        [langList[i]!],
        style,
        totalStep,
        speed,
        progressCallback,
      );

      if (wavCat.length === 0) {
        wavCat = wav;
        durCat = duration[0]!;
      } else {
        const silenceLen = Math.floor(silenceDuration * this.sampleRate);
        const silence = new Array<number>(silenceLen).fill(0);
        wavCat = [...wavCat, ...silence, ...wav];
        durCat += duration[0]! + silenceDuration;
      }
    }

    return { wav: wavCat, duration: [durCat] };
  }

  private sampleNoisyLatent(
    duration: number[],
    sampleRate: number,
    baseChunkSize: number,
    chunkCompress: number,
    latentDim: number,
  ): { xt: number[][][]; latentMask: number[][][] } {
    const bsz = duration.length;
    const maxDur = Math.max(...duration);

    const wavLenMax = Math.floor(maxDur * sampleRate);
    const wavLengths = duration.map((d) => Math.floor(d * sampleRate));

    const chunkSize = baseChunkSize * chunkCompress;
    const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize);
    const latentDimVal = latentDim * chunkCompress;

    const xt: number[][][] = [];
    for (let b = 0; b < bsz; b++) {
      const batch: number[][] = [];
      for (let d = 0; d < latentDimVal; d++) {
        const row: number[] = [];
        for (let t = 0; t < latentLen; t++) {
          // Box-Muller transform
          const u1 = Math.max(0.0001, Math.random());
          const u2 = Math.random();
          row.push(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
        }
        batch.push(row);
      }
      xt.push(batch);
    }

    const latentLengths = wavLengths.map((len) =>
      Math.floor((len + chunkSize - 1) / chunkSize),
    );
    const latentMask = lengthToMask(latentLengths, latentLen);

    // Apply mask
    for (let b = 0; b < bsz; b++) {
      for (let d = 0; d < latentDimVal; d++) {
        for (let t = 0; t < latentLen; t++) {
          xt[b]![d]![t]! *= latentMask[b]![0]![t]!;
        }
      }
    }

    return { xt, latentMask };
  }
}

function lengthToMask(lengths: number[], maxLen: number | null = null): number[][][] {
  const actualMaxLen = maxLen ?? Math.max(...lengths);
  return lengths.map((len) => {
    const row = new Array<number>(actualMaxLen).fill(0.0);
    for (let j = 0; j < Math.min(len, actualMaxLen); j++) row[j] = 1.0;
    return [row];
  });
}

interface VoiceStyleJson {
  style_ttl: { dims: number[]; data: number[] };
  style_dp: { dims: number[]; data: number[] };
}

/** Load one voice style JSON into the paired TTL/DP tensors. */
export async function loadVoiceStyle(
  ort: OrtModule,
  voiceStyleUrl: string,
): Promise<Style> {
  const response = await fetch(voiceStyleUrl);
  if (!response.ok) {
    throw new Error(`Failed to load voice style (${response.status})`);
  }
  const raw: unknown = await response.json();
  const voiceStyle = raw as VoiceStyleJson;

  const ttlDims = voiceStyle.style_ttl.dims;
  const dpDims = voiceStyle.style_dp.dims;

  // `data` is nested at runtime; flatten to a flat numeric array.
  const ttlData = voiceStyle.style_ttl.data.flat(Infinity);
  const dpData = voiceStyle.style_dp.data.flat(Infinity);

  const ttlTensor = new ort.Tensor("float32", new Float32Array(ttlData), [
    1,
    ttlDims[1]!,
    ttlDims[2]!,
  ]);
  const dpTensor = new ort.Tensor("float32", new Float32Array(dpData), [
    1,
    dpDims[1]!,
    dpDims[2]!,
  ]);

  return new Style(ttlTensor, dpTensor);
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  const data: unknown = await response.json();
  return data as T;
}

export type ModelProgressCallback = (
  modelName: string,
  current: number,
  total: number,
) => void;

/**
 * Load every TTS component from `baseUrl`. Expects the upstream HuggingFace
 * layout: `<baseUrl>/onnx/*.onnx`, `<baseUrl>/onnx/tts.json`,
 * `<baseUrl>/onnx/unicode_indexer.json`.
 */
export async function loadTextToSpeech(
  ort: OrtModule,
  baseUrl: string,
  sessionOptions: Ort.InferenceSession.SessionOptions = {},
  progressCallback: ModelProgressCallback | null = null,
): Promise<{ textToSpeech: TextToSpeech; cfgs: TtsConfig }> {
  const onnxDir = `${baseUrl}/onnx`;
  const cfgs = await loadJson<TtsConfig>(`${onnxDir}/tts.json`);

  const modelPaths = [
    { name: "Duration Predictor", path: `${onnxDir}/duration_predictor.onnx` },
    { name: "Text Encoder", path: `${onnxDir}/text_encoder.onnx` },
    { name: "Vector Estimator", path: `${onnxDir}/vector_estimator.onnx` },
    { name: "Vocoder", path: `${onnxDir}/vocoder.onnx` },
  ];

  const sessions: InferenceSession[] = [];
  for (let i = 0; i < modelPaths.length; i++) {
    progressCallback?.(modelPaths[i]!.name, i + 1, modelPaths.length);
    sessions.push(
      await ort.InferenceSession.create(modelPaths[i]!.path, sessionOptions),
    );
  }

  const [dpOrt, textEncOrt, vectorEstOrt, vocoderOrt] = sessions;

  const indexer = await loadJson<number[]>(`${onnxDir}/unicode_indexer.json`);
  const textProcessor = new UnicodeProcessor(indexer);

  const textToSpeech = new TextToSpeech(
    cfgs,
    textProcessor,
    dpOrt!,
    textEncOrt!,
    vectorEstOrt!,
    vocoderOrt!,
    ort,
  );

  return { textToSpeech, cfgs };
}

/** Split text into <= maxLen chunks on paragraph then sentence boundaries. */
export function chunkText(text: string, maxLen = 300): string[] {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n+/)
    .filter((p) => p.trim());

  const chunks: string[] = [];

  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) continue;

    const sentences = paragraph.split(
      /(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/,
    );

    let currentChunk = "";
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 1 <= maxLen) {
        currentChunk += (currentChunk ? " " : "") + sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
  }

  // Never return an empty list — fall back to the whole (trimmed) text.
  return chunks.length > 0 ? chunks : [text.trim()];
}

/** Encode mono float32 PCM samples as a 16-bit WAV ArrayBuffer. */
export function writeWavFile(
  audioData: number[],
  sampleRate: number,
): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = audioData.length * 2;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const int16Data = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    const clamped = Math.max(-1.0, Math.min(1.0, audioData[i]!));
    int16Data[i] = Math.floor(clamped * 32767);
  }

  new Uint8Array(buffer, 44).set(new Uint8Array(int16Data.buffer));
  return buffer;
}
