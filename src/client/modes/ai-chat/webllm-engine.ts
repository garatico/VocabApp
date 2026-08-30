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
import { CreateWebWorkerMLCEngine, type WebWorkerMLCEngine, type ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import type { ChatEngine, ChatMessage, EngineStatus } from '../ai-chat-mode.ts';
import { DEFAULT_MODEL_ID } from './model.ts';

export class WebLLMEngine implements ChatEngine {
  private _status: EngineStatus = 'unloaded';
  private _error: string | null = null;
  private handle: WebWorkerMLCEngine | null = null;

  status(): EngineStatus {
    return this._status;
  }

  errorMessage(): string | null {
    return this._error;
  }

  async load(onProgress: (pct: number, note: string) => void): Promise<void> {
    this._status = 'loading';
    this._error = null;
    try {
      const worker = new Worker(new URL('./webllm-worker.ts', import.meta.url), { type: 'module' });
      this.handle = await CreateWebWorkerMLCEngine(worker, DEFAULT_MODEL_ID, {
        initProgressCallback: report => {
          onProgress(Math.round(report.progress * 100), report.text);
        },
      });
      this._status = 'ready';
    } catch (err) {
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
    const stream = await this.handle.chat.completions.create({
      messages: messages as ChatCompletionMessageParam[],
      temperature: 0.3,
      top_p: 0.9,
      stream: true,
    });
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
