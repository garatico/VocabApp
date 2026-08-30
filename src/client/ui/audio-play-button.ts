/**
 * audio-play-button.ts — a small speaker button that plays a pre-generated
 * pronunciation clip (see server/lib/audio-loader.ts and VocabApp-Data's
 * `audio` pipeline step — offline Piper TTS, not a live API call).
 *
 * Returns null when there's nothing to play rather than a disabled button:
 * most words don't have audio yet (this starts as a small pilot, not full
 * coverage — see CLAUDE.md), and a button disabled on the vast majority of
 * rows reads as broken, not as "coming soon". Callers just skip appending it.
 */
export function buildAudioButton(audioUrl: string | null | undefined): HTMLButtonElement | null {
  if (!audioUrl) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'audio-play-btn';
  btn.title = 'Play pronunciation';
  btn.setAttribute('aria-label', 'Play pronunciation');
  btn.textContent = '🔊';

  // Created lazily, once, on first click — not eagerly for every row, which
  // would mean one <audio> element (and one HTTP request queued) per word in
  // a list that can run into the thousands.
  let audio: HTMLAudioElement | null = null;
  btn.addEventListener('click', e => {
    e.stopPropagation(); // rows are clickable (expand/select) in every caller
    if (!audio) audio = new Audio(audioUrl);
    audio.currentTime = 0;
    void audio.play();
  });

  return btn;
}
