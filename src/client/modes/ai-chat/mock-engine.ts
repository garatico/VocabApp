/**
 * mock-engine.ts — a ChatEngine that needs no model, no WebGPU, no download.
 *
 * ai-chat-mode.ts falls back to this whenever `navigator.gpu` isn't
 * available, so the tab still demos its own UI (streaming text, message
 * list, task presets) on a machine/browser that can't run WebLLMEngine —
 * rather than the tab just being broken there. The status pill makes clear
 * which engine is active; this one never claims to be the real thing.
 */
import type { ChatEngine, ChatMessage, EngineStatus } from '../ai-chat-mode.ts';

export class MockEngine implements ChatEngine {
  private _status: EngineStatus = 'unloaded';

  status(): EngineStatus {
    return this._status;
  }

  errorMessage(): string | null {
    return null;
  }

  async load(onProgress: (pct: number, note: string) => void): Promise<void> {
    this._status = 'loading';
    const steps = ['Fetching model weights…', 'Loading into memory…', 'Warming up…'];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 350));
      onProgress(Math.round(((i + 1) / steps.length) * 100), steps[i]);
    }
    this._status = 'ready';
  }

  async send(messages: ChatMessage[], onToken: (delta: string) => void): Promise<void> {
    const last = messages[messages.length - 1]?.content ?? '';
    const reply = `(demo mode — no WebGPU detected, so no real model is running)\n\n`
      + `You asked: "${last}". Open this tab in a WebGPU browser (recent Chrome/Edge) `
      + 'to talk to the real local model.';
    for (const word of reply.split(' ')) {
      await new Promise(r => setTimeout(r, 18));
      onToken(word + ' ');
    }
  }
}
