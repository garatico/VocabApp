/**
 * webllm-worker.ts — runs the actual model off the UI thread.
 *
 * The first Worker in this codebase. WebLLM's WASM/WebGPU work is heavy
 * enough (loading multi-hundred-MB weights, running inference) that doing
 * it on the main thread would freeze the tab for the duration — this file
 * is loaded via `new Worker(new URL('./webllm-worker.ts', import.meta.url),
 * { type: 'module' })` in webllm-engine.ts, and everything past these two
 * lines just routes worker messages to a real MLCEngine.
 */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Constructs its own MLCEngine internally — despite what the package's own
// example comment shows, the actual constructor takes no arguments.
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
