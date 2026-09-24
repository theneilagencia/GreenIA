// Envio de email atrás de uma interface. Produção: SMTP (Amazon SES em
// sa-east-1, por SMTP). Testes: memória. Configuração de SPF, DKIM e DMARC no README.
import { createTransport, type Transporter } from 'nodemailer';

export interface EmailMessage { to: string; subject: string; text: string }

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

export class SmtpEmailSender implements EmailSender {
  private transport: Transporter;
  private from: string;

  constructor(smtpUrl: string, from: string) {
    this.transport = createTransport(smtpUrl);
    this.from = from;
  }

  async send(msg: EmailMessage) {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text });
  }
}

// Guarda as mensagens em memória (testes e ambiente local sem SMTP).
export class MemoryEmailSender implements EmailSender {
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage) { this.sent.push(msg); }
}
