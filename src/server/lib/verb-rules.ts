/**
 * verb-rules.ts — moved to src/shared/verb-rules.ts so the Tauri client can
 * use the same conjugation engine as the server, without duplicating it.
 * Pure computation, zero Node dependencies, so the move was verbatim.
 * Re-exported here so every existing server import keeps working unchanged.
 */
export * from '../../shared/verb-rules.js';
