/**
 * japanese-romaji.ts — moved to src/shared/japanese-romaji.ts so the Tauri
 * client can use the same romanization as the server, without duplicating
 * it. Only dependency is `wanakana` (pure JS), so the move was verbatim.
 * Re-exported here so every existing server import keeps working unchanged.
 */
export * from '../../shared/japanese-romaji.js';
