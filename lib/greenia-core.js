// Funções puras da GreenIA, sem dependência do runtime do Claude Design.
//
// O runtime (support.js) avalia o <script data-dc-script> com `new Function`
// e não importa arquivos. Por isso o bloco entre os marcadores abaixo é
// copiado literalmente para GreenIA.dc.html. scripts/check-sync.mjs falha se
// as duas cópias divergirem. Edite aqui e rode `node scripts/check-sync.mjs --write`.

// >>> greenia-core
// ---- Typewriter -------------------------------------------------------------
const TYPEWRITER_MAX_MS = 1200;
const TYPEWRITER_FRAME_MS = 1000 / 60;

// Caracteres por quadro para que o texto inteiro apareça em ~maxMs.
function typewriterChunk(length, maxMs = TYPEWRITER_MAX_MS, frameMs = TYPEWRITER_FRAME_MS) {
  const frames = Math.max(1, Math.floor(maxMs / frameMs));
  return Math.max(1, Math.ceil(length / frames));
}

// Quantos caracteres mostrar após `elapsed` ms, tendo mostrado `shown`.
// Avança ao menos um bloco por quadro e nunca fica atrás do relógio, então
// mesmo com quadros lentos o total não passa de maxMs.
function typewriterNext(length, shown, elapsed, chunk, maxMs = TYPEWRITER_MAX_MS) {
  const byClock = Math.ceil(length * Math.min(1, elapsed / maxMs));
  return Math.min(length, Math.max(shown + chunk, byClock));
}
// <<< greenia-core

if (typeof module !== 'undefined') {
  module.exports = { TYPEWRITER_MAX_MS, TYPEWRITER_FRAME_MS, typewriterChunk, typewriterNext };
}
