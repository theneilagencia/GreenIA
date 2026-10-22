// Direitos pagos ficam no banco da empresa: efeito e deduplicação na mesma transação.
import { exec, todos, um, transacao } from '../db.js';
import { erro } from '../http.js';

function esquema(t) {
  t.db.exec(`create table if not exists stripe_controle (
    id integer primary key check(id=1), ativada_em text not null, saldo_inicial real not null,
    pacote_base integer not null, uso_base integer not null default 0, bloqueada integer not null default 0);
    create table if not exists stripe_periodos (
    comprovante text primary key, inicio text not null, fim text not null,
    creditos integer not null, reserva integer not null, produto text not null);
    create table if not exists stripe_efeitos (comprovante text primary key, tipo text not null);`);
  if (!t.db.prepare('pragma table_info(stripe_controle)').all().some(c=>c.name==='uso_base')) t.db.exec('alter table stripe_controle add column uso_base integer not null default 0');
}

export function concederDireitoStripe(t, { comprovante, produto, inicio, fim, creditos, reserva, quantidade = 1, moeda, total }, legado) {
  esquema(t);
  return transacao(t.db, () => {
    if (um(t.db, 'select 1 from stripe_efeitos where comprovante=?', comprovante)) return { repetido: true };
    if (produto === 'capacity_pack') {
      exec(t.db, `insert into pacotes (em,creditos,observacao,origem,operador,produto,preco_usd) values (?,?,?,?,?,?,?)`,
        t.agora().toISOString(), creditos * quantidade, 'Pagamento Stripe confirmado', 'stripe', 'stripe', 'capacity_pack', moeda === 'usd' ? total / 100 : 0);
    } else {
      if (!(Number.isSafeInteger(creditos) && creditos > 0 && Number.isSafeInteger(reserva) && reserva >= 0)
        || !Number.isFinite(Date.parse(inicio)) || !Number.isFinite(Date.parse(fim)) || inicio >= fim) throw erro(409, 'stripe_periodo', 'Período de cobrança inválido.');
      if (um(t.db, 'select 1 from stripe_periodos where inicio < ? and fim > ?', fim, inicio)) throw erro(409, 'stripe_periodo', 'Existe outro período pago sobreposto; concilie a cobrança.');
      if (!um(t.db, 'select 1 from stripe_controle')) {
        if (legado?.pacoteDisponivel>0 && um(t.db,"select 1 from pacotes where validade is not null and validade >= ?",t.agora().toISOString().slice(0,10))) throw erro(409,'stripe_migracao','Concilie os pacotes legados com validade antes de migrar a cobrança.');
        const base = um(t.db, 'select coalesce(max(id),0) n from pacotes').n;
        const usoBase=um(t.db,'select coalesce(max(id),0) n from uso').n;
        exec(t.db, 'insert into stripe_controle (id,ativada_em,saldo_inicial,pacote_base,uso_base) values (1,?,?,?,?)', t.agora().toISOString(), legado?.pacoteDisponivel || 0, base,usoBase);
      }
      exec(t.db, 'insert into stripe_periodos values (?,?,?,?,?,?)', comprovante, inicio, fim, creditos, reserva, produto);
    }
    exec(t.db, 'insert into stripe_efeitos values (?,?)', comprovante, produto === 'capacity_pack' ? 'pacote' : 'periodo');
    return { repetido: false };
  });
}

export function situacaoDireitosStripe(t) {
  // Empresas manuais e instalações antigas continuam com a regra anterior.
  if (!um(t.db, "select 1 from sqlite_master where type='table' and name='stripe_controle'")) return null;
  const cfg = um(t.db, 'select * from stripe_controle where id=1');
  if (!cfg) return null;
  const agora = t.agora().toISOString();
  const periodos = todos(t.db, 'select * from stripe_periodos where inicio <= ? order by inicio', agora);
  const atual = periodos.find(p => p.inicio <= agora && p.fim > agora);
  const ultimo = periodos.at(-1);
  if (!atual || cfg.bloqueada) return { fase: 'esgotado', cobrancaPendente: true, creditos: ultimo?.creditos || 0,
    reserva: 0, usados: 0, pacoteDisponivel: 0, naReserva: 0, percentual: 0, percentualReserva: 0,
    renova: (ultimo?.fim || agora).slice(0,10), ciclo: ultimo?.comprovante || 'sem_periodo' };
  // Replay cronológico: pacotes novos não pagam retroativamente um excesso de um período anterior.
  const fila = [{ restante: cfg.saldo_inicial, validade: null }];
  const eventos = [
    ...todos(t.db, 'select em,creditos,validade,id from pacotes where id > ? and em <= ?', cfg.pacote_base, agora).map(p => ({ ...p, tipo: 0 })),
    ...todos(t.db, 'select em,custo,id from uso where id > ? and em >= ? and em <= ? order by em,id', cfg.uso_base,periodos[0].inicio>cfg.ativada_em?periodos[0].inicio:cfg.ativada_em, agora).map(u => ({ ...u, tipo: 1 })),
  ].sort((a,b) => a.em.localeCompare(b.em) || a.tipo-b.tipo || a.id-b.id);
  const usados = new Map(), reservas = new Map();
  for (const e of eventos) {
    if (e.tipo === 0) { fila.push({ restante: e.creditos, validade: e.validade }); continue; }
    const p = periodos.find(p => p.inicio <= e.em && p.fim > e.em);
    if (!p) continue;
    const antes = usados.get(p.comprovante) || 0, n = Math.max(0, Number(e.custo) * 100);
    usados.set(p.comprovante, antes+n);
    let falta = Math.max(0, n - Math.max(0, p.creditos-antes));
    for (const pacote of fila) {
      if (pacote.validade && pacote.validade < e.em.slice(0,10)) continue;
      const d = Math.min(falta, pacote.restante); pacote.restante -= d; falta -= d;
      if (!falta) break;
    }
    reservas.set(p.comprovante, (reservas.get(p.comprovante) || 0) + falta);
  }
  const arred = n => Math.round(n*10000)/10000;
  const total = arred(usados.get(atual.comprovante) || 0), reserva = arred(reservas.get(atual.comprovante) || 0);
  const pacote = arred(fila.filter(p => !p.validade || p.validade >= agora.slice(0,10)).reduce((s,p)=>s+p.restante,0));
  const fase = total < atual.creditos ? (total >= atual.creditos*.8 ? 'aviso' : 'normal') : pacote > 0 ? 'pacote' : reserva >= atual.reserva ? 'esgotado' : 'reserva';
  return { fase, cobrancaPendente: false, creditos: atual.creditos, reserva: atual.reserva, usados: total,
    pacoteDisponivel: pacote, naReserva: reserva, renova: atual.fim.slice(0,10), ciclo: atual.comprovante,
    percentual: Math.min(100, Math.round(total/atual.creditos*100)), percentualReserva: atual.reserva ? Math.min(100,Math.round(reserva/atual.reserva*100)) : 100 };
}
