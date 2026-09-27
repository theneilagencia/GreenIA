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
      const r = await nodemailer.createTransport(url).sendMail({ from: de, to: para, subject: assunto, text: texto });
      // Registro do envio (sem assunto, que pode ter código): para conferir por qual servidor saiu.
      let servidor = '?'; try { servidor = new URL(url).host; } catch {}
      log(`[email] enviado para ${para} via ${servidor}: ${String(r?.response || '').slice(0, 120)}`);
    },
  };
}
