// Layout dos emails (HTML) no sistema visual da GreenIA: fundo areia, cartão branco com borda fina, símbolo e nome da
// marca, rótulo em versalete, título em serifa, texto em sans, botão na cor da marca e rodapé discreto. Montado a
// partir do texto que cada parte do sistema já escreve (assunto + texto): parágrafos, listas, links e códigos de
// acesso viram os elementos do cartão, sem cada remetente precisar conhecer HTML. O texto puro continua indo junto.
// Tabelas e estilos inline: é o que os clientes de email (Gmail, Outlook, Apple Mail) respeitam.
const URL_PUBLICA = (process.env.URL_PUBLICA || 'https://www.greenia.com.br').replace(/\/+$/, '');
const C = { fundo: '#F8F6F1', cartao: '#FFFFFF', linha: '#E7E3DA', tinta: '#1A1915', texto: '#3D3B36', suave: '#5C5A54', marca: '#1B7950', marcaIa: '#17764D', codigo: '#EDF3EE' };
const SANS = "Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
const SERIF = "'Source Serif 4','Iowan Old Style',Georgia,'Times New Roman',serif";
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const URL_RE = /https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?]/g;
const linkar = s => esc(s).replace(/https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?]/g, u => `<a href="${u}" style="color:${C.marca};text-decoration:underline;word-break:break-all">${u}</a>`);

// Rótulo do botão pelo assunto (ação principal do email); o padrão é abrir a GreenIA.
function rotuloDoBotao(assunto, url) {
  const a = String(assunto || '').toLowerCase();
  if (/convite/.test(a)) return 'Aceitar o convite';
  if (/c[oó]pia dos dados|exporta/.test(a)) return 'Baixar a cópia';
  if (/tarefa programada|quick win/.test(a)) return 'Abrir os Quick Wins';
  if (/contato/.test(a)) return 'Ver o contato';
  if (/console|backup|saldo|chave/.test(a) || /\/console|\/plataforma/.test(url)) return 'Abrir o console';
  return 'Abrir a GreenIA';
}

export function htmlDoEmail({ assunto = '', texto = '', rotulo = 'GreenIA' } = {}) {
  const titulo = String(assunto).replace(/^GreenIA:\s*/i, '').replace(/:\s*\d{4,8}\s*$/, '').trim() || 'GreenIA';
  const codigo = /c[oó]digo/i.test(`${assunto} ${texto}`) ? /\b(\d{6})\b/.exec(`${assunto} ${texto}`)?.[1] : null;
  const urls = String(texto).match(URL_RE) || [];
  const principal = urls[0] || null;
  const caixaCodigo = codigo ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td style="background:${C.codigo};border:1px solid #D5E6DA;border-radius:10px;padding:14px 22px;font:600 28px/1 ${MONO};letter-spacing:6px;color:${C.tinta}">${esc(codigo)}</td></tr></table>` : '';
  const blocos = String(texto).replace(/\r/g, '').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const corpo = blocos.map(b => {
    const linhas = b.split('\n');
    // Parágrafo que é só o link principal: o botão já faz esse papel.
    if (principal && b === principal) return '';
    if (linhas.every(l => /^\s*[-•]\s+/.test(l))) return `<ul style="margin:0 0 16px;padding-left:20px;color:${C.texto}">${linhas.map(l => `<li style="margin:0 0 6px">${linkar(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    // Parágrafo do código: vira a chamada e o código aparece em destaque logo abaixo dele.
    if (codigo && b.includes(codigo)) return `<p style="margin:0 0 12px;font:400 15px/1.65 ${SANS};color:${C.texto}">Use este código para entrar:</p>${caixaCodigo}`;
    return `<p style="margin:0 0 16px;font:400 15px/1.65 ${SANS};color:${C.texto}">${linhas.map(linkar).join('<br>')}</p>`;
  }).join('');
  const botao = principal && !codigo ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px"><tr><td style="background:${C.marca};border-radius:8px"><a href="${esc(principal)}" style="display:inline-block;padding:14px 24px;font:600 15px/1 ${SANS};color:#FFFFFF;text-decoration:none;border-radius:8px">${esc(rotuloDoBotao(assunto, principal))}</a></td></tr></table>` : '';
  const previa = esc(String(texto).replace(URL_RE, '').replace(/\s+/g, ' ').trim().slice(0, 110));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.fundo};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${previa}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fundo}"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td style="padding:0 4px 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;padding-right:10px"><img src="${URL_PUBLICA}/assets/greenia-email.png" width="28" height="28" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle;font:600 19px/1 ${SANS};color:${C.tinta};letter-spacing:-.2px">Green<span style="color:${C.marcaIa}">IA</span></td></tr></table></td></tr>
<tr><td style="background:${C.cartao};border:1px solid ${C.linha};border-radius:12px;padding:40px 40px 32px">
<div style="font:600 11px/1 ${SANS};letter-spacing:2.2px;text-transform:uppercase;color:${C.suave};margin:0 0 14px">${esc(rotulo)}</div>
<h1 style="margin:0 0 24px;font:400 28px/1.25 ${SERIF};color:${C.tinta}">${esc(titulo)}</h1>
${corpo}${codigo && !corpo.includes(caixaCodigo) ? caixaCodigo : ''}${botao}
</td></tr>
<tr><td style="padding:24px 8px 0;text-align:center;font:400 12px/1.6 ${SANS};color:${C.suave}">
GreenIA · <a href="${URL_PUBLICA}" style="color:${C.suave};text-decoration:underline">${URL_PUBLICA.replace(/^https?:\/\//, '')}</a><br>Email automático da plataforma. Não é preciso responder.
</td></tr></table></td></tr></table></body></html>`;
}
