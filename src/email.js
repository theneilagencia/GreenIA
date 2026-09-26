// Envio de email por SMTP genérico. Sem SMTP configurado, guarda em memória
// (testes e desenvolvimento) e mostra no log.
import nodemailer from 'nodemailer';

export function criarEmail({ lerSmtp, log = console.log }) {
  const enviados = [];
  return {
    enviados,
    async enviar(para, assunto, texto) {
      const smtp = lerSmtp();
      if (!smtp.url) { enviados.push({ para, assunto, texto }); log(`[email simulado] ${para}: ${assunto}`); return; }
      await nodemailer.createTransport(smtp.url).sendMail({ from: smtp.remetente || 'GreenIA <nao-responda@localhost>', to: para, subject: assunto, text: texto });
    },
  };
}
