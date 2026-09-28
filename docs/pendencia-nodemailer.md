# Pendência de segurança: atualização do Nodemailer

Tarefa independente, **fora da entrega de governança, retenção e arquivos**. Não misturar com outra mudança.

## Situação

- Versão instalada: `nodemailer@7.0.13`.
- `npm audit`: 1 vulnerabilidade **alta**, em versões `<= 9.1.0`. Correção disponível em `nodemailer@10.x`, que
  muda a versão principal (pode quebrar a API).
- Avisos citados: injeção de CRLF em comandos SMTP e cabeçalhos (`envelope.size`, nome do transporte,
  comentários `List-*`), desvio de `disableFileAccess`/`disableUrlAccess` (`raw`, `jsonTransport`,
  `resolveContent`), validação de TLS no token OAuth2, desvio de lista de domínios (IDN, comentários RFC 5322) e
  lentidão quadrática no `addressparser`.

## Avaliação de impacto (preliminar, a confirmar na tarefa)

O uso é um só: `src/email.js`, `createTransport(url).sendMail({ from, to, subject, text })`.

| Ponto | Uso na GreenIA | Exposição estimada |
|---|---|---|
| `envelope`, `raw`, `list`, anexos, `jsonTransport`, OAuth2 | Não usados | Baixa |
| Cabeçalhos com texto de fora | `subject` inclui nome de empresa ou de base (texto de admin/lead) | A verificar: tratamento de CRLF |
| Destinatários (`addressparser`) | Emails validados antes (login, convites, admins) | Baixa a média |
| Transporte | URL do SMTP vinda de variável de ambiente ou do console (operador/admin) | Baixa |

## Plano de atualização controlada

1. Ler o changelog de 7.x → 10.x e listar as mudanças que afetam `createTransport`, `sendMail` e as opções de
   transporte usadas em `transporteDe`.
2. Atualizar só o `nodemailer`, num commit próprio, com `npm install nodemailer@10`.
3. Validar: `npm test`, envio real num SMTP de teste (código de acesso, convite, aviso de governança) e envio pela
   plataforma multiempresa.
4. Publicar separado e acompanhar os eventos de falha de email (`app.log('email ...')`) por alguns dias.
