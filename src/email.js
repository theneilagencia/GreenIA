// Envio de email por SMTP genérico ou por API HTTPS (Resend, Brevo), para hospedagens que
// bloqueiam SMTP de saída. Sem nada configurado, guarda em memória (testes e desenvolvimento)
// e mostra no log.
import nodemailer from 'nodemailer';

// Aceita a senha (e o usuário) do endereço SMTP com qualquer caractere, codificados ou não:
// o servidor é o que vem depois do ÚLTIMO @, e o usuário vai até o primeiro ":".
export function normalizarSmtpUrl(url) {
  const m = /^(smtps?):\/\/(.+)@([^@/?#]+)([/?#].*)?$/i.exec(String(url || '').trim());
  if (!m) return String(url || '').trim();
  const [, esquema, credenciais, servidor, resto = ''] = m;
  const i = credenciais.indexOf(':');
  const cod = v => { let t = v; try { t = decodeURIComponent(v); } catch {} return encodeURIComponent(t); };
  const usuario = i < 0 ? credenciais : credenciais.slice(0, i), senha = i < 0 ? '' : credenciais.slice(i + 1);
  return `${esquema.toLowerCase()}://${cod(usuario)}${i < 0 ? '' : ':' + cod(senha)}@${servidor}${resto}`;
}

// Envio por API HTTPS: EMAIL_API=resend|brevo e EMAIL_API_CHAVE viram "resend://CHAVE" ou "brevo://CHAVE".
const API = {
  resend: (chave, de, para, assunto, texto) => ({ url: 'https://api.resend.com/emails', headers: { authorization: `Bearer ${chave}` }, corpo: { from: de, to: [para], subject: assunto, text: texto } }),
  brevo: (chave, de, para, assunto, texto) => {
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(de) || [null, '', de];
    return { url: 'https://api.brevo.com/v3/smtp/email', headers: { 'api-key': chave }, corpo: { sender: { name: m[1] || undefined, email: m[2].trim() }, to: [{ email: para }], subject: assunto, textContent: texto } };
  },
};
async function enviarPorApi(provedor, chave, de, para, assunto, texto, f) {
  const p = API[provedor](chave, de, para, assunto, texto);
  const r = await f(p.url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...p.headers }, body: JSON.stringify(p.corpo) });
  const corpo = await r.text().catch(() => '');
  if (!r.ok) throw new Error(`${provedor} respondeu ${r.status}: ${corpo.replaceAll(chave, '[chave]').slice(0, 200)}`);
  return `${r.status} ${corpo.slice(0, 80)}`;
}

// Monta o endereço a partir de variáveis separadas (sem precisar codificar nada).
export function smtpDeVariaveis(env) {
  if (env.EMAIL_API && API[String(env.EMAIL_API).toLowerCase()] && env.EMAIL_API_CHAVE) return `${String(env.EMAIL_API).toLowerCase()}://${env.EMAIL_API_CHAVE}`;
  if (env.SMTP_URL) return normalizarSmtpUrl(env.SMTP_URL);
  if (!env.SMTP_SERVIDOR || !env.SMTP_USUARIO) return '';
  const porta = Number(env.SMTP_PORTA || 465);
  return `smtp${porta === 465 ? 's' : ''}://${encodeURIComponent(env.SMTP_USUARIO)}:${encodeURIComponent(env.SMTP_SENHA || '')}@${env.SMTP_SERVIDOR}:${porta}`;
}

// Transporte SMTP a partir do endereço, com prazos curtos: um servidor que não responde (ou uma porta
// bloqueada pela hospedagem) vira erro em segundos, não uma espera de minutos.
function transporteDe(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: Number(u.port) || (u.protocol === 'smtps:' ? 465 : 587), secure: u.protocol === 'smtps:',
      auth: u.username ? { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) } : undefined,
      connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000 };
  } catch { return url; }
}

// O que deu errado, em linguagem de quem configura o email da empresa (sem senha, usuário nem chave).
export function explicarFalhaEmail(e, smtp = {}) {
  const msg = String(e?.message || e || ''), cod = e?.code || '', resp = Number(e?.responseCode) || 0;
  let host = '', porta = '';
  try { const u = new URL(normalizarSmtpUrl(smtp.url)); host = u.hostname; porta = u.port || (u.protocol === 'smtps:' ? '465' : '587'); } catch {}
  const api = /^(resend|brevo):\/\//i.exec(String(smtp.url || ''))?.[1];
  const nomeApi = api ? api[0].toUpperCase() + api.slice(1).toLowerCase() : '';
  if (api) {
    if (/domain is not verified|not verified|sender.*not.*valid|unauthorized sender/i.test(msg)) return `O ${nomeApi} recusou o remetente: o domínio do email remetente não está verificado na conta do ${nomeApi}. Verifique o domínio lá (registros DNS) ou use um remetente de um domínio já verificado.`;
    if (/\b(401|403)\b/.test(msg) && /key|chave|unauthor|forbidden|invalid/i.test(msg)) return `O ${nomeApi} recusou a chave de API. Gere uma chave nova com permissão de envio e salve de novo.`;
    if (/\b422\b/.test(msg)) return `O ${nomeApi} recusou a mensagem: confira o email remetente (formato "Nome <email@dominio>").`;
    if (/\b429\b/.test(msg)) return `O ${nomeApi} limitou os envios da conta (muitas mensagens em pouco tempo ou cota do plano). Tente de novo mais tarde.`;
    return `O ${nomeApi} não aceitou o envio: ${msg.slice(0, 160)}`;
  }
  if ((cod === 'EAUTH' || resp === 535 || resp === 534) && /gmail|google/i.test(host)) return 'O Gmail recusou o usuário ou a senha. Use o email completo como usuário e uma senha de app de 16 letras (não a senha normal), criada em myaccount.google.com/apppasswords com a verificação em duas etapas ligada. Em contas Google Workspace, o administrador do Google pode ter desligado as senhas de app.';
  if ((cod === 'EAUTH' || resp === 535 || resp === 534) && /office365|outlook|microsoft/i.test(host)) return 'A Microsoft recusou o usuário ou a senha. O administrador do Microsoft 365 precisa liberar o SMTP autenticado para esta caixa; com verificação em duas etapas, use uma senha de app.';
  if (cod === 'EAUTH' || resp === 535 || resp === 534) return `O servidor ${host} recusou o usuário ou a senha. No Google e na Microsoft é preciso uma senha de app (com verificação em duas etapas) e, na Microsoft, o SMTP autenticado liberado para a caixa.`;
  if (['ETIMEDOUT', 'ECONNREFUSED', 'ECONNECTION', 'ESOCKET', 'ENOTFOUND', 'EHOSTUNREACH'].includes(cod) || /timeout|timed out|ECONNREFUSED|getaddrinfo/i.test(msg))
    return `Não foi possível conectar a ${host}:${porta}. Confira o servidor e a porta; se estiverem certos, a hospedagem pode estar bloqueando SMTP de saída. Nesse caso, use o envio por serviço (Resend ou Brevo), que funciona por HTTPS.`;
  if (cod === 'EENVELOPE' || [550, 551, 553, 554].includes(resp) || /sender|from address|not owned|send as/i.test(msg))
    return `O servidor ${host} não aceitou o remetente. Use como remetente o mesmo email da conta que envia (ou um endereço que ela tenha permissão de usar).`;
  if (/certificate|self.signed|SSL|TLS|wrong version/i.test(msg)) return `A conexão segura com ${host}:${porta} falhou. Normalmente a porta 465 usa SSL e a 587 usa STARTTLS; confira a porta.`;
  return `O servidor de email recusou o envio: ${msg.slice(0, 160)}`;
}

export function criarEmail({ lerSmtp, log = console.log, fetch: f = globalThis.fetch }) {
  const enviados = [];
  return {
    enviados,
    async enviar(para, assunto, texto) {
      const smtp = lerSmtp();
      if (!smtp.url) { enviados.push({ para, assunto, texto }); log(`[email simulado] ${para}: ${assunto}`); return; }
      const de = smtp.remetente || 'GreenIA <nao-responda@localhost>';
      const api = /^(resend|brevo):\/\/(.+)$/i.exec(String(smtp.url).trim());
      if (api) {
        const resposta = await enviarPorApi(api[1].toLowerCase(), api[2], de, para, assunto, texto, f);
        log(`[email] enviado para ${para} via ${api[1].toLowerCase()}: ${resposta}`);
        return;
      }
      const url = normalizarSmtpUrl(smtp.url);
      const r = await nodemailer.createTransport(transporteDe(url)).sendMail({ from: de, to: para, subject: assunto, text: texto });
      // Registro do envio (sem assunto, que pode ter código): para conferir por qual servidor saiu.
      let servidor = '?'; try { servidor = new URL(url).host; } catch {}
      log(`[email] enviado para ${para} via ${servidor}: ${String(r?.response || '').slice(0, 120)}`);
    },
  };
}
