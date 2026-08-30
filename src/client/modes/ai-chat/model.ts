/**
 * model.ts — the one place the active WebLLM model id lives.
 *
 * Stock Qwen2.5-1.5B-Instruct for now (q4f16_1 quantization — the size/
 * quality balance point among WebLLM's prebuilt configs). Swapping in a
 * fine-tuned build later (see VocabApp-Model/) is meant to be a one-line
 * change here — nothing else in ai-chat/ should hardcode a model id.
 */
export const DEFAULT_MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
