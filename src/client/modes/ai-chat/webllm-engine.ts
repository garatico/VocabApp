/**
 * webllm-engine.ts — the real ChatEngine, backed by MLC-AI's WebLLM running
 * in a dedicated worker (webllm-worker.ts) so token generation never blocks
 * the UI thread.
 *
 * Requires WebGPU (`navigator.gpu`) — ai-chat-mode.ts checks that and only
 * constructs this engine when it's present, falling back to MockEngine
 * otherwise. That check is deliberately *not* duplicated in load() below:
 * if this class's load() ever runs without WebGPU, CreateWebWorkerMLCEngine
 * itself will reject and the failure still surfaces through errorMessage(),
 * it just wouldn't have the friendlier "no WebGPU" wording.
 */
import type { ChatCompletionMessageParam, ChatCompletionChunk, InitProgressReport } from '@mlc-ai/web-llm';
import type { ChatEngine, ChatMessage, EngineStatus } from '../ai-chat-mode.ts';
import { DEFAULT_MODEL_ID } from './model.ts';

/**
 * A minimal client for WebLLM's worker message protocol (the "reload" /
 * "unload" / "chatCompletionStreamInit" / "completionStreamNextChunk" calls
 * answered by `WebWorkerMLCEngineHandler` in webllm-worker.ts).
 *
 * Why not the package's own `CreateWebWorkerMLCEngine`? It lives in the same
 * 6 MB module as the engine itself, so importing it here shipped a second
 * copy of WebLLM to the main thread — the worker already carries the first.
 * Only *types* are imported from the package now, which erases at build time.
 * The protocol is internal to @mlc-ai/web-llm, so the dependency is pinned to
 * an exact version in package.json; re-check these message kinds on upgrade.
 */
class WorkerClient {
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

  constructor(
    private worker: Worker,
    private onProgress: (report: InitProgressReport) => void,
  ) {
    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data as { kind: string; uuid: string; content: unknown };
      if (msg.kind === 'initProgressCallback') {
        this.onProgress(msg.content as InitProgressReport);
        return;
      }
      const cb = this.pending.get(msg.uuid);
      if (!cb) return;
      this.pending.delete(msg.uuid);
      if (msg.kind === 'return') cb.resolve(msg.content);
      else cb.reject(msg.content);
    };
  }

  call<T = unknown>(kind: string, content: unknown): Promise<T> {
    const uuid = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(uuid, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ kind, uuid, content });
    });
  }

  async *stream(request: Record<string, unknown>, modelId: string): AsyncGenerator<ChatCompletionChunk> {
    await this.call('chatCompletionStreamInit', {
      request,
      selectedModelId: modelId,
      modelId: [modelId],
      chatOpts: undefined,
    });
    for (;;) {
      const chunk = await this.call<ChatCompletionChunk | undefined>('completionStreamNextChunk', {
        selectedModelId: modelId,
      });
      // The worker's generator signals the end by returning a non-object.
      if (typeof chunk !== 'object' || chunk === null) return;
      yield chunk;
    }
  }
}

export class WebLLMEngine implements ChatEngine {
  private _status: EngineStatus = 'unloaded';
  private _error: string | null = null;
  private handle: WorkerClient | null = null;
  /** The raw Worker behind `handle`, tracked so load() (the "Reload model"
   *  button) can actually shut the previous one down. */
  private worker: Worker | null = null;

  status(): EngineStatus {
    return this._status;
  }

  errorMessage(): string | null {
    return this._error;
  }

  async load(onProgress: (pct: number, note: string) => void): Promise<void> {
    // "Reload model" calling load() a second time used to just create a
    // fresh worker and overwrite `this.handle`, leaking the previous one —
    // both its GPU-resident model weights (WebWorkerMLCEngine.unload()
    // exists precisely to release those) and the worker thread itself.
    // Clicking Reload a few times left that many abandoned model instances
    // running in the background.
    if (this.handle) {
      try { await this.handle.call('unload', null); } catch { /* best-effort — proceed either way */ }
    }
    this.worker?.terminate();
    this.handle = null;
    this.worker = null;

    this._status = 'loading';
    this._error = null;
    // Kept as a local until the engine actually finishes constructing — if
    // CreateWebWorkerMLCEngine rejects, this worker was still created and
    // needs cleaning up itself, but never becomes `this.worker` (nothing
    // else should treat a failed load as having one).
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./webllm-worker.ts', import.meta.url), { type: 'module' });
      const client = new WorkerClient(worker, report => {
        onProgress(Math.round(report.progress * 100), report.text);
      });
      await client.call('reload', { modelId: [DEFAULT_MODEL_ID], chatOpts: undefined });
      this.handle = client;
      this.worker = worker;
      this._status = 'ready';
    } catch (err) {
      worker?.terminate();
      this._status = 'error';
      this._error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async send(messages: ChatMessage[], onToken: (delta: string) => void): Promise<void> {
    if (!this.handle) throw new Error('WebLLMEngine.send() called before load() succeeded');

    // ChatMessage's role union (system/user/assistant) is the same three
    // WebLLM's discriminated ChatCompletionMessageParam union expects per
    // element — this cast is just TS not narrowing a shared-shape array
    // into a per-element discriminated union on its own.
    //
    // Low temperature/top_p on purpose: a 1.5B model's default (near-1.0)
    // sampling is what produced answers like confirming a mistyped Spanish
    // sentence as correct — this app's tasks (explain, correct, quiz) want
    // the model's most likely answer, not a creative one.
    const stream = this.handle.stream({
      messages: messages as ChatCompletionMessageParam[],
      temperature: 0.3,
      top_p: 0.9,
      stream: true,
    }, DEFAULT_MODEL_ID);
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) onToken(delta);
    }
  }
}

/** True when this browser can run WebLLMEngine at all. */
export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
