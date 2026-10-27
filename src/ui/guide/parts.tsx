import { TERMS } from './terms';

export const K = ({ k }: { k: string }) => <kbd>{k}</kbd>;
export const Tip = ({ children }: { children: preact.ComponentChildren }) => <div class="g-tip">{children}</div>;
export const Warn = ({ children }: { children: preact.ComponentChildren }) => <div class="g-warn">{children}</div>;
/** "Deneyin": 1–3 adımlık mini görev; kullanıcı okumadan yaparak öğrenir */
export const Try = ({ steps }: { steps: preact.ComponentChildren[] }) => (
  <div class="g-try"><b>Deneyin</b><ol>{steps.map((s) => <li>{s}</li>)}</ol></div>
);
/** Terim: üstüne gelince açıklama balonu. Kullanıcı "bu ne demek?" demesin diye. */
export const T = ({ t, children }: { t: string; children?: preact.ComponentChildren }) => {
  const text = TERMS[t.toLocaleLowerCase('tr')];
  return <span class="g-term" tabIndex={0}>{children ?? t}{text && <span class="g-term-pop" role="tooltip">{text}</span>}</span>;
};
/** Görsel + numaralı kısa notlar: öğrenme yükü görselde, metin tek satır */
export const Shot = ({ src, alt, w, notes }: { src: string; alt: string; w?: 'full' | 'narrow' | 'mid'; notes?: preact.ComponentChildren[] }) => (
  <figure class={`g-fig ${w ?? 'full'}`}>
    <img src={`./guide/${src}`} alt={alt} loading="lazy" />
    {notes && notes.length > 0 ? <ol class="g-notes">{notes.map((n) => <li><span>{n}</span></li>)}</ol> : <figcaption>{alt}</figcaption>}
  </figure>
);
export const Flow = ({ steps }: { steps: preact.ComponentChildren[] }) => (
  <div class="g-flow">{steps.map((s, i) => <>{i > 0 && <i>→</i>}<span>{s}</span></>)}</div>
);
