// Registro de eventos (tabela só de inclusão). Nunca guarda conteúdo de conversa.
import { exec } from './db.js';

export function registrar(app, tipo, pessoaId, detalhes = {}) {
  exec(app.db, 'insert into eventos (em, pessoa_id, tipo, detalhes) values (?, ?, ?, ?)', app.agora().toISOString(), pessoaId ?? null, tipo, JSON.stringify(detalhes));
}
