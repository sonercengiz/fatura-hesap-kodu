import { useEffect, useState } from 'preact/hooks';
import * as S from './state';
import { sections, keys, troubles } from './guide/sections';

/** Kullanım rehberi: sol içindekiler (gruplu), sağda bölümler. İlk açılışta kendiliğinden gelir. */
export function GuideModal() {
  const [active, setActive] = useState('baslangic');
  const go = (id: string) => document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  useEffect(() => {
    const body = document.querySelector('.guide-body');
    if (!body) return;
    const obs = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) setActive(e.target.id.replace('g-', '')); }, { root: body, rootMargin: '0px 0px -70% 0px' });
    body.querySelectorAll('section[id^="g-"]').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
  const groups = Array.from(new Set(sections.map((s) => s.group)));
  const close = () => (S.guideOpen.value = false);
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal guide" onClick={(e) => e.stopPropagation()} onKeyDownCapture={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <div class="modal-head">
          <b>Kullanım rehberi</b>
          <span class="muted">Görseller hayali bir firmanın örnek faturalarıdır. Terimlerin üstüne gelince açıklaması çıkar.</span>
          <div class="spacer" />
          <button class="ghost" onClick={close}>Kapat <kbd>Esc</kbd></button>
        </div>
        <div class="guide-wrap">
          <nav class="guide-toc">
            {groups.map((g) => (
              <>
                <div class="guide-toc-group">{g}</div>
                {sections.filter((s) => s.group === g).map((s) => <a href={`#g-${s.id}`} class={active === s.id ? 'active' : ''} onClick={(e) => { e.preventDefault(); go(s.id); }}>{s.short}</a>)}
              </>
            ))}
            <div class="guide-toc-group">Başvuru</div>
            <a href="#g-klavye" class={active === 'klavye' ? 'active' : ''} onClick={(e) => { e.preventDefault(); go('klavye'); }}>Klavye</a>
            <a href="#g-sorun" class={active === 'sorun' ? 'active' : ''} onClick={(e) => { e.preventDefault(); go('sorun'); }}>Sık durumlar</a>
          </nav>
          <div class="guide-body" onClick={(e) => { const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null; if (a) { e.preventDefault(); go(a.getAttribute('href')!.replace('#', '')); } }}>
            {sections.map((s) => (
              <section class="guide-step" id={`g-${s.id}`}><h3>{s.title}</h3><div class="guide-text">{s.body}</div></section>
            ))}
            <section class="guide-step" id="g-klavye">
              <h3>Klavye</h3>
              <table class="keys-table"><tbody>{keys.map(([k, d]) => <tr><td>{k.split(/\s{2,}/).map((x) => <kbd>{x}</kbd>)}</td><td>{d}</td></tr>)}</tbody></table>
            </section>
            <section class="guide-step" id="g-sorun">
              <h3>Sık karşılaşılan durumlar</h3>
              <table class="g-table"><tbody>{troubles.map(([q, a]) => <tr><td><b>{q}</b></td><td>{a}</td></tr>)}</tbody></table>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
