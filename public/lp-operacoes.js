// Editorial simulations only. No API calls, storage or operational actions.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
for (const demo of document.querySelectorAll('[data-op-demo]')) {
  const play = demo.querySelector('[data-op-play]');
  const steps = [...demo.querySelectorAll('[data-op-step]')];
  const panels = [...demo.querySelectorAll('[data-op-panel]')];
  const duration = 15000, boundaries = [0, 5000, 10000];
  let elapsed = 0, last = 0, frame = 0, playing = false, visible = false, started = false;
  demo.querySelector('.op-controls').hidden = false;
  const render = () => {
    const stage = boundaries.findLastIndex(t => elapsed >= t);
    demo.dataset.stage = String(stage);
    demo.dataset.playing = String(playing && visible && !document.hidden);
    panels.forEach((panel, i) => { panel.hidden = i !== stage; });
    steps.forEach((button, i) => {
      if (i === stage) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    demo.style.setProperty('--op-progress', `${elapsed / duration * 100}%`);
    demo.querySelector('.op-time').textContent = `00:${String(Math.floor(elapsed / 1000)).padStart(2, '0')} / 00:15`;
    const label = playing ? 'Pausar' : elapsed >= duration ? 'Rever' : 'Reproduzir';
    play.replaceChildren(document.createTextNode(`${label} `));
    const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true');
    icon.textContent = playing ? 'Ⅱ' : elapsed >= duration ? '↻' : '▷'; play.append(icon);
    play.setAttribute('aria-label', `${label} exemplo de ${demo.dataset.opDemo}`);
  };
  // Update the lightweight clock/progress only; render cards and controls on stage changes.
  const tick = now => {
    frame = 0;
    if (!playing || !visible || document.hidden) { last = 0; render(); return; }
    const before = Math.floor(elapsed / 5000);
    if (last) elapsed = Math.min(duration, elapsed + now - last);
    last = now;
    demo.style.setProperty('--op-progress', `${elapsed / duration * 100}%`);
    demo.querySelector('.op-time').textContent = `00:${String(Math.floor(elapsed / 1000)).padStart(2, '0')} / 00:15`;
    if (elapsed >= duration) { playing = false; last = 0; render(); }
    else if (before !== Math.floor(elapsed / 5000)) render();
    if (playing) frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    cancelAnimationFrame(frame); frame = 0; last = 0; render();
    if (playing && visible && !document.hidden) frame = requestAnimationFrame(tick);
  };
  play.addEventListener('click', () => {
    started = true;
    if (elapsed >= duration) elapsed = 0;
    playing = !playing; sync();
  });
  steps.forEach(button => button.addEventListener('click', () => {
    started = true; playing = false; elapsed = boundaries[Number(button.dataset.opStep)]; sync();
  }));
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible && !started && !reduced.matches) { started = true; playing = true; }
    sync();
  }, { threshold: .25 }).observe(demo);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', () => { if (reduced.matches) playing = false; sync(); });
  render();
}
