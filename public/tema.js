// Aparência (tema): Automático (segue o sistema), Claro ou Escuro. A escolha fica só neste navegador.
// Script clássico, carregado no <head> antes do CSS ser aplicado à página: põe data-tema no <html> já na
// primeira pintura (sem piscar claro antes do escuro). As telas usam window.temaGreenIA para o seletor.
(function () {
  var CHAVE = 'greenia-tema', OPCOES = ['auto', 'claro', 'escuro'], memoria = 'auto';
  function ler() {
    try { var v = localStorage.getItem(CHAVE); if (OPCOES.indexOf(v) >= 0) return v; } catch (e) { return memoria; }
    return memoria;
  }
  function aplicar(v) {
    v = OPCOES.indexOf(v) >= 0 ? v : ler();
    var raiz = document.documentElement;
    if (v === 'auto') raiz.removeAttribute('data-tema'); else raiz.setAttribute('data-tema', v);
    return v;
  }
  function escolher(v) {
    v = OPCOES.indexOf(v) >= 0 ? v : 'auto';
    memoria = v;
    try { if (v === 'auto') localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, v); } catch (e) { /* sem armazenamento: vale nesta aba */ }
    aplicar(v);
    try { document.dispatchEvent(new CustomEvent('greenia:tema', { detail: v })); } catch (e) { /* navegador antigo */ }
    return v;
  }
  // O tema efetivo agora (para quem precisa saber se a tela está escura, como a marca da empresa).
  function escuro() {
    var v = ler();
    if (v !== 'auto') return v === 'escuro';
    try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }
  // Seletor "Aparência" (um <select> com rótulo). `id` deve ser único na página.
  function seletorHtml(id, classe) {
    var atual = ler();
    var op = [['auto', 'Automático (do sistema)'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(function (o) {
      return '<option value="' + o[0] + '"' + (o[0] === atual ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    return '<div class="tema-escolha' + (classe ? ' ' + classe : '') + '"><label for="' + id + '">Aparência</label>' +
      '<select id="' + id + '" data-tema-seletor>' + op + '</select></div>';
  }
  function ligarSeletor(raiz) {
    (raiz || document).querySelectorAll('[data-tema-seletor]').forEach(function (s) {
      s.value = ler();
      s.onchange = function () { escolher(s.value); };
    });
  }
  // Outra aba mudou a escolha: acompanha.
  try { addEventListener('storage', function (e) { if (e.key === CHAVE) { aplicar(); ligarSeletor(); } }); } catch (e) { /* sem window */ }
  aplicar();
  window.temaGreenIA = { ler: ler, aplicar: aplicar, escolher: escolher, escuro: escuro, seletorHtml: seletorHtml, ligarSeletor: ligarSeletor };
})();
