// Demonstração: npm run demo
// Sobe a GreenIA com uma empresa fictícia (3 áreas, pessoas, documentos, 4 quick
// wins, um modelo homologado, uso de exemplo) e a IA simulada. Nada sai da máquina.
// O banco fica em memória: ao parar, tudo some. O código de acesso aparece aqui no terminal.
import { criarApp } from '../src/servidor.js';
import { criarSimulada } from '../src/ia.js';
import { salvarConfig } from '../src/config.js';
import { cliente } from './cliente.js';
import { todos } from '../src/db.js';

const DOMINIO = 'empresa-demo.com.br';
const porta = Number(process.env.PORTA || 8080);
const app = criarApp({ ia: criarSimulada(), banco: ':memory:', cookieSeguro: false, adminEmail: `admin@${DOMINIO}`, log: () => {} });
await new Promise(r => app.servidor.listen(porta, process.env.HOST || '127.0.0.1', r));
const base = `http://127.0.0.1:${porta}`;
const b64 = t => Buffer.from(t).toString('base64');
salvarConfig(app.db, { empresa: 'Empresa Demonstração', dominios: [DOMINIO] });

// Cliente que para a demonstração se algum passo for recusado.
const conferido = async email => {
  const c = await cliente(app, base).entrar(email);
  const req = c.req;
  c.req = async (...a) => { const r = await req(...a); if (r.status >= 400) throw new Error(`${a[0]} ${a[1]}: ${r.status} ${JSON.stringify(r.dados)}`); return r; };
  return c;
};
const admin = await conferido(`admin@${DOMINIO}`);
const areas = {};
for (const nome of ['Atendimento', 'Operações', 'Administrativo']) areas[nome] = (await admin.post('/api/admin/areas', { nome })).dados.id;
const PESSOAS = [
  ['julia', 'Júlia Andrade', [['Atendimento', true]]],
  ['bruno', 'Bruno Teixeira', [['Operações', true]]],
  ['carla', 'Carla Menezes', [['Administrativo', true]]],
  ['diego', 'Diego Ramos', [['Atendimento'], ['Operações']]],
  ['elisa', 'Elisa Moura', [['Administrativo']]],
];
for (const [u, nome, as] of PESSOAS) await admin.post('/api/admin/pessoas', { email: `${u}@${DOMINIO}`, nome, areas: as.map(([a, r]) => ({ id: areas[a], responsavel: !!r })) });
await admin.post('/api/admin/grupos', { nome: 'Gestores', pessoas: [] });
// Homologado padrão: o modelo do perfil Rápido com fornecedor fixado (docs/modelos-sugeridos.md).
await admin.post(`/api/admin/modelos/${encodeURIComponent('google/gemini-3.5-flash-lite')}/homologar`, {
  fornecedor: 'google-vertex', semTreino: true, retencaoZero: true, justificativa: 'Demonstração: fornecedor com retenção zero, conferido na página do modelo no OpenRouter.',
});

const entrar = u => conferido(`${u}@${DOMINIO}`);
const doc = (c, area, titulo, texto) => c.post('/api/bases/documentos', { area_id: areas[area], titulo, arquivo: { nome: `${titulo}.md`, base64: b64(texto) } });
const [julia, bruno, carla, diego, elisa] = await Promise.all(['julia', 'bruno', 'carla', 'diego', 'elisa'].map(entrar));
await doc(julia, 'Atendimento', 'Prazos de resposta', '# Prazos de resposta\n\n- Reclamação: resposta em até 2 dias úteis.\n- Pedido de informação: até 5 dias úteis.\n- Toda resposta cita o número do chamado.');
await doc(bruno, 'Operações', 'Recebimento de mercadorias', '# Recebimento\n\nTodo pedido recebido é conferido contra a nota em até 2 dias úteis. Diferença de preço acima de 2% vai para o comprador. Item faltando sempre é registrado.');
await doc(carla, 'Administrativo', 'Reembolso de despesas', '# Reembolso\n\nDespesas são reembolsadas com comprovante em até 30 dias. Acima de R$ 500, precisa de aprovação do gestor.');

const modelos = (await admin.get('/api/quick-wins/modelos-iniciais')).dados.modelos;
const criar = async (c, modelo, area, extra = {}) => {
  const q = (await c.post('/api/quick-wins', { modelo_inicial: modelos.findIndex(m => m.nome === modelo), ...(area ? { areas: [areas[area]] } : { toda_empresa: true }) })).dados;
  await c.put(`/api/quick-wins/${q.id}`, { status: 'ativo', ...extra });
  return q;
};
const qwResposta = await criar(julia, 'Redigir resposta padrão', 'Atendimento');
const qwConferir = await criar(bruno, 'Conferir dois documentos', 'Operações', { nome: 'Conferência de pedido × nota' });
const qwCotacoes = await criar(carla, 'Comparar cotações', 'Administrativo');
const qwRevisar = await criar(admin, 'Revisar texto antes de enviar', null);

// Uso de exemplo, para a medição ter números.
const conversar = async (c, qw, texto, feedback) => {
  const conv = (await c.post('/api/conversas', { quick_win_id: qw.id })).dados.conversa;
  await c.req('POST', `/api/conversas/${conv.id}/mensagens`, { texto });
  if (feedback) await c.patch(`/api/conversas/${conv.id}`, { feedback });
};
await conversar(diego, qwConferir, 'Confira estes dois documentos e liste as diferenças', 'serviu');
await conversar(diego, qwConferir, 'Os valores dos dois documentos batem?', 'ajustes');
await conversar(diego, qwResposta, 'Escreva uma resposta para um cliente que pediu o prazo de entrega', 'serviu');
await conversar(elisa, qwCotacoes, 'Compare estas três cotações de material de escritório', 'serviu');
await conversar(elisa, qwRevisar, 'Revise este email antes de eu enviar ao fornecedor');
await bruno.post(`/api/quick-wins/${qwConferir.id}/medicoes`, { indicador: 'minutos por pedido conferido', antes_valor: 25, antes_data: '2026-08-01', antes_origem: 'medido', depois_valor: 9, depois_data: '2026-09-15', depois_origem: 'medido', observacao: 'Média de 20 pedidos em cada período.' });
await bruno.post(`/api/quick-wins/${qwConferir.id}/decisoes`, { decisao: 'manter', motivo: 'O tempo caiu e a equipe está usando. Reavaliar no próximo mês.' });

const qws = todos(app.db, "select nome from quick_wins where status = 'ativo'").map(q => q.nome);

// A partir daqui, o código de acesso de cada login aparece no terminal.
app.log = (...a) => console.log(...a);
app.email.enviar = async (para, assunto) => { const c = /(\d{6})/.exec(assunto); console.log(c ? `  Código de acesso para ${para}: ${c[1]}` : `  [email] ${para}: ${assunto}`); };
console.log(`
GreenIA, demonstração com a IA simulada (nada vai para um modelo real).
Empresa Demonstração: 3 áreas, 6 pessoas, 3 documentos de base e ${qws.length} quick wins (${qws.join(', ')}).\nAbra ${base} e entre com um destes emails. O código aparece aqui.

  admin@${DOMINIO}    admin (painel completo)
  bruno@${DOMINIO}    responsável por Operações (veja a medição do quick win "Conferência de pedido × nota")
  diego@${DOMINIO}    usa Atendimento e Operações
  elisa@${DOMINIO}    usa Administrativo

Para parar: Ctrl+C. O banco é em memória e some ao parar.
`);
