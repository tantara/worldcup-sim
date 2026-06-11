/**
 * Static catalog data for the Supertonic TTS engine: voice presets and the
 * supported synthesis languages. Pure data — safe to import anywhere without
 * pulling in `onnxruntime-web`.
 */

export interface VoiceOption {
  /** Voice style id, matches `<baseUrl>/voice_styles/<id>.json`. */
  id: string;
  /** Display name (sourced from the OpenBrief voice catalog). */
  label: string;
}

/** Ten preset voices (5 male, 5 female). Names mirror OpenBrief's catalog. */
export const VOICES: VoiceOption[] = [
  { id: "M1", label: "Mark" },
  { id: "M2", label: "David" },
  { id: "M3", label: "Daniel" },
  { id: "M4", label: "James" },
  { id: "M5", label: "Lucas" },
  { id: "F1", label: "Emma" },
  { id: "F2", label: "Sophia" },
  { id: "F3", label: "Olivia" },
  { id: "F4", label: "Ava" },
  { id: "F5", label: "Mia" },
];

export const DEFAULT_VOICE_ID = "M1";

export interface LanguageOption {
  code: string;
  label: string;
}

/** The 31 synthesis languages exposed by Supertonic 3. */
export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
  { code: "ar", label: "العربية" },
  { code: "bg", label: "Bulgarian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "de", label: "Deutsch" },
  { code: "el", label: "Greek" },
  { code: "es", label: "Español" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "Français" },
  { code: "hi", label: "Hindi" },
  { code: "hr", label: "Croatian" },
  { code: "hu", label: "Hungarian" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "lt", label: "Lithuanian" },
  { code: "lv", label: "Latvian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Português" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "sv", label: "Swedish" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "vi", label: "Vietnamese" },
];

export const DEFAULT_LANG = "en";

/** HuggingFace CDN base for the Supertonic 3 assets (onnx + voice styles). */
export const SUPERTONIC_ASSET_BASE =
  "https://huggingface.co/Supertone/supertonic-3/resolve/main";

export function voiceStyleUrl(baseUrl: string, voiceId: string): string {
  return `${baseUrl}/voice_styles/${voiceId}.json`;
}
