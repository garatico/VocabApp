/**
 * assets/types.ts — how src/shared/vocab/shape-word.ts gets a word's
 * svg_url/audio_url without depending on Node's fs directly.
 *
 * The server's implementation (src/server/lib/svg-loader.ts,
 * src/server/lib/audio-loader.ts) checks fs.existsSync live. The Tauri
 * client's implementation instead consults a manifest built at bundle time
 * (there's no fs.existsSync in a webview) — see src/client/tauri's asset
 * resolver, added when the Tauri asset pipeline lands.
 */
export interface AssetResolver {
  svgUrl(language: string, word: string): string | null;
  audioUrl(language: string, word: string): string | null;
}
