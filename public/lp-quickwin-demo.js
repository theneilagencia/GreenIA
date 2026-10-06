// Simulação editorial local, sem chamadas de rede ou ações de integração.
const demo = document.querySelector('.qw-demo');
if (demo) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const controls = demo.querySelector('.qd-controls');
  const play = demo.querySelector('[data-play]');
  const stages = [...demo.querySelectorAll('[data-go]')];
  const panels = [...demo.querySelectorAll('[data-panel]')];
  const durations = [5500, 6500, 5500, 6500];
  const total = durations.reduce((a, b) => a + b, 0);
  const boundaries = [0, 5500, 12000, 17500];
  let elapsed = 0, last = 0, frame = 0, playing = false, visible = false, started = false;
  controls.hidden = false;
  const render = () => {
    const stage = boundaries.findLastIndex(t => elapsed >= t);
    if (demo.dataset.stage !== String(stage)) {
      demo.dataset.stage = String(stage);
      panels.forEach((panel, i) => { panel.hidden = i !== stage; });
      stages.forEach((button, i) => {
        if (i === stage) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
        button.dataset.done = String(i < stage);
      });
    }
    demo.style.setProperty('--qd-progress', `${Math.min(100, elapsed / total * 100).toFixed(2)}%`);
    demo.querySelector('.qd-time').textContent = `00:${String(Math.floor(elapsed / 1000)).padStart(2, '0')} / 00:24`;
    demo.dataset.playing = String(playing && visible && !document.hidden);
    play.textContent = playing ? 'Pausar' : elapsed >= total ? 'Rever' : 'Reproduzir';
    play.setAttribute('aria-label', playing ? 'Pausar demonstração' : elapsed >= total ? 'Rever demonstração' : 'Reproduzir demonstração');
  };
  const tick = now => {
    frame = 0;
    if (!playing || !visible || document.hidden) { last = 0; render(); return; }
    if (last) elapsed = Math.min(total, elapsed + now - last);
    last = now;
    if (elapsed >= total) { playing = false; last = 0; }
    render();
    if (playing) frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    cancelAnimationFrame(frame); frame = 0; last = 0; render();
    if (playing && visible && !document.hidden) frame = requestAnimationFrame(tick);
  };
  play.addEventListener('click', () => {
    started = true;
    if (elapsed >= total) elapsed = 0;
    playing = !playing; sync();
  });
  demo.querySelector('[data-restart]').addEventListener('click', () => {
    started = true; elapsed = 0; playing = !reduced.matches; sync();
  });
  stages.forEach(button => button.addEventListener('click', () => {
    started = true; playing = false; elapsed = boundaries[Number(button.dataset.go)]; sync();
  }));
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible && !started && !reduced.matches) { started = true; playing = true; }
    sync();
  }, { threshold: .18 }).observe(demo);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', () => { if (reduced.matches) playing = false; sync(); });
  render();
}
