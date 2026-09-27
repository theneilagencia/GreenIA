// Envio de email por SMTP genérico. Sem SMTP configurado, guarda em memória
// (testes e desenvolvimento) e mostra no log.
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

// Monta o endereço a partir de variáveis separadas (sem precisar codificar nada).
export function smtpDeVariaveis(env) {
  if (env.SMTP_URL) return normalizarSmtpUrl(env.SMTP_URL);
  if (!env.SMTP_SERVIDOR || !env.SMTP_USUARIO) return '';
  const porta = Number(env.SMTP_PORTA || 465);
  return `smtp${porta === 465 ? 's' : ''}://${encodeURIComponent(env.SMTP_USUARIO)}:${encodeURIComponent(env.SMTP_SENHA || '')}@${env.SMTP_SERVIDOR}:${porta}`;
}

export function criarEmail({ lerSmtp, log = console.log }) {
  const enviados = [];
  return {
    enviados,
    async enviar(para, assunto, texto) {
      const smtp = lerSmtp();
      if (!smtp.url) { enviados.push({ para, assunto, texto }); log(`[email simulado] ${para}: ${assunto}`); return; }
      await nodemailer.createTransport(normalizarSmtpUrl(smtp.url)).sendMail({ from: smtp.remetente || 'GreenIA <nao-responda@localhost>', to: para, subject: assunto, text: texto });
    },
  };
}
