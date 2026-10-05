// Generalização do Integration Builder com o motor congelado: pedidos NÃO usados no ajuste do detector, de dez
// áreas (CRM, financeiro, RH, atendimento, projetos, documentos, suporte, operações, fornecedores, relatórios), e
// três casos de negócio (Financeiro, Gestão, RH/Administrativo) resolvidos contra conectores da própria empresa.
// Nenhuma regra por setor: o detector só reconhece ações e sistemas nomeados; a resolução usa o catálogo da empresa
// e a política (dados), e o que não existe fica "precisa configurar". Pedidos só de texto não ganham integração.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/servidor.js';
import { salvarConfig } from '../src/config.js';
import { exec } from '../src/db.js';
import { necessidadesDoPedido, resolverNecessidades, criarPlano } from '../src/integracoes/plano.js';
import { criarConector, definirCapabilities, mudarStatus, lerConector } from '../src/integracoes/conectores.js';

// [área, pedido, esperado: lista de [categoria, modo] ou [] quando não há sistema externo]
const PEDIDOS = [
  ['CRM', 'Procure o histórico de compras do cliente no Salesforce e sugira a próxima abordagem.', [['read_data', 'read']]],
  ['CRM', 'Altere o responsável pela conta no RD Station e avise o novo responsável por e-mail.', [['update_record', 'write'], ['send_message', 'write']]],
  ['Financeiro', 'Traga os recebimentos atrasados do sistema financeiro e faça uma tabela por cliente.', [['read_data', 'read']]],
  ['Financeiro', 'Lance a despesa de viagem no Conta Azul.', [['create_record', 'write']]],
  ['RH', 'Inclua o atestado médico no sistema de RH e atualize o saldo de faltas no sistema de RH.', [['create_record', 'write'], ['update_record', 'write']]],
  ['RH', 'Monte um roteiro de entrevista para analista de dados.', []],
  ['Atendimento', 'Consulte as reclamações da semana no Reclame Aqui e agrupe por motivo.', [['read_data', 'read']]],
  ['Atendimento', 'Mande uma mensagem pelo WhatsApp Business para os clientes com pedido atrasado.', [['send_message', 'write']]],
  ['Projetos', 'Verifique as entregas atrasadas no Asana e crie um resumo para a reunião de status.', [['read_data', 'read']]],
  ['Projetos', 'Mova o card para concluído no Trello.', [['update_record', 'write']]],
  ['Documentos', 'Suba o relatório final no Google Drive.', [['upload_file', 'write']]],
  ['Documentos', 'Revise a minuta do contrato e aponte cláusulas de risco.', []],
  ['Suporte', 'Abra um chamado no GLPI para a troca do notebook da recepção.', [['create_record', 'write']]],
  ['Suporte', 'Leia os incidentes críticos no ServiceNow e redija o comunicado para a diretoria.', [['read_data', 'read']]],
  ['Operações', 'Confira o nível dos tanques no sistema de telemetria e registre a leitura no ERP.', [['read_data', 'read'], ['create_record', 'write']]],
  ['Operações', 'Escreva um procedimento operacional para a limpeza da câmara fria.', []],
  ['Fornecedores', 'Obtenha as cotações recebidas no portal de compras e compare preço e prazo.', [['read_data', 'read']]],
  ['Fornecedores', 'Remova o fornecedor descredenciado do cadastro no SAP.', [['delete_record', 'write']]],
  ['Relatórios', 'Exporte as vendas do trimestre do Bling e prepare um relatório para os sócios.', [['read_data', 'read']]],
  ['Relatórios', 'Crie um infográfico com os resultados de satisfação do semestre.', []],
  ['CRM', 'Registre a visita ao cliente no Agendor depois de consultar o endereço no Agendor.', [['read_data', 'read'], ['create_record', 'write']]],
  ['Financeiro', 'Faça uma análise do fluxo de caixa a partir da planilha anexada.', []],
];

test(`generalização: ${PEDIDOS.length} pedidos inéditos de 10 áreas, motor congelado`, () => {
  const areas = new Set(PEDIDOS.map(p => p[0]));
  assert.ok(areas.size >= 10 && PEDIDOS.length >= 20);
  const falhas = [];
  for (const [area, pedido, esperado] of PEDIDOS) {
    const obtido = necessidadesDoPedido(pedido).map(n => [n.categoria, n.modo]);
    if (JSON.stringify(obtido) !== JSON.stringify(esperado)) falhas.push(`${area}: ${pedido} -> ${JSON.stringify(obtido)} (esperado ${JSON.stringify(esperado)})`);
  }
  // Critério: nenhum pedido só de texto ganha integração (falso positivo é bloqueador) e ao menos 90% exatos.
  const falsoPositivo = PEDIDOS.filter(([, p, e]) => !e.length && necessidadesDoPedido(p).length);
  assert.deepEqual(falsoPositivo, [], 'pedido de texto não vira integração');
  assert.ok(falhas.length <= Math.floor(PEDIDOS.length * 0.1), falhas.join('\n'));
  if (falhas.length) console.log('# divergências (até 10% aceitas):\n# ' + falhas.join('\n# '));
});

// Rodada 2 (pedidos novos, escritos depois do ajuste genérico de vocabulário da rodada 1, nunca usados no ajuste).
const PEDIDOS_2 = [
  ['CRM', 'Pesquise os contatos sem interação há 90 dias no Moskit e proponha uma campanha de reativação.', [['read_data', 'read']]],
  ['CRM', 'Feche a oportunidade como ganha no Pipedrive.', [['update_record', 'write']]],
  ['Financeiro', 'Baixe o extrato do dia no Banco Inter e concilie com as notas emitidas.', [['read_data', 'read']]],
  ['Financeiro', 'Calcule a margem de contribuição de cada produto a partir dos números informados.', []],
  ['RH', 'Transfira o colaborador para o centro de custo novo no Senior.', [['update_record', 'write']]],
  ['RH', 'Avise a equipe por e-mail sobre o novo horário do refeitório.', [['send_message', 'write']]],
  ['Atendimento', 'Reabra o ticket no Zendesk e informe o prazo ao cliente.', [['update_record', 'write']]],
  ['Atendimento', 'Crie respostas padrão para as dúvidas mais comuns sobre entrega.', []],
  ['Projetos', 'Procure os riscos registrados no Monday e priorize por impacto.', [['read_data', 'read']]],
  ['Projetos', 'Encerre a sprint no Jira e gere o relatório de velocidade.', [['update_record', 'write']]],
  ['Documentos', 'Salve a ata da reunião no SharePoint.', [['upload_file', 'write']]],
  ['Documentos', 'Traduza este manual para o espanhol.', []],
  ['Suporte', 'Consulte o inventário de máquinas no GLPI e aponte as que estão sem garantia.', [['read_data', 'read']]],
  ['Suporte', 'Registre a solução do incidente na base de conhecimento do Freshservice.', [['create_record', 'write']]],
  ['Operações', 'Agende a manutenção preventiva no sistema de manutenção para a próxima semana.', [['create_record', 'write']]],
  ['Operações', 'Liste os passos para a abertura da loja pela manhã.', []],
  ['Fornecedores', 'Envie o pedido de cotação para os fornecedores pelo portal de compras.', [['send_message', 'write']]],
  ['Fornecedores', 'Avalie os três fornecedores com base nos critérios de qualidade, prazo e preço.', []],
  ['Relatórios', 'Extraia os chamados resolvidos do mês no Jira Service Management e monte um gráfico.', [['read_data', 'read']]],
  ['Relatórios', 'Transforme estes números em um relatório executivo de uma página.', []],
];
test(`generalização, rodada 2: ${PEDIDOS_2.length} pedidos novos depois do ajuste genérico`, () => {
  const falhas = [];
  for (const [area, pedido, esperado] of PEDIDOS_2) {
    const obtido = necessidadesDoPedido(pedido).map(n => [n.categoria, n.modo]);
    if (JSON.stringify(obtido) !== JSON.stringify(esperado)) falhas.push(`${area}: ${pedido} -> ${JSON.stringify(obtido)} (esperado ${JSON.stringify(esperado)})`);
  }
  assert.deepEqual(PEDIDOS_2.filter(([, p, e]) => !e.length && necessidadesDoPedido(p).length).map(x => x[1]), [], 'pedido de texto não vira integração');
  if (falhas.length) console.log('# divergências:\n# ' + falhas.join('\n# '));
  assert.ok(falhas.length <= Math.floor(PEDIDOS_2.length * 0.1), falhas.join('\n'));
});

const ADM = { id: 1, admin: true, email: 'adm@exemplo.test', permissoes: [] };
function app() {
  const a = criarApp({ log: () => {} });
  exec(a.db, "insert or ignore into pessoas (id, email, nome, papel) values (1, 'adm@exemplo.test', 'Adm', 'admin')");
  salvarConfig(a.db, { integracoes: { ativa: true, pessoas: [], politicas: [], limite_minuto_empresa: 300, rede_privada_autorizada: false } });
  return a;
}
// Conector ativo de um sistema fictício (sem rede: a resolução só olha o catálogo e a política).
function ativo(a, sistema, ops) {
  const c = criarConector(a, ADM, { nome: `QA - ${sistema}`, sistema, base_url: 'https://api.exemplo.test', auth_type: 'none',
    operacoes: ops.map(([id, metodo, categoria, efeitos = {}]) => ({ operation_id: id, metodo, caminho: `/${id}`, resumo: id, classe: metodo === 'GET' ? 'SAFE_READ' : metodo === 'DELETE' ? 'DESTRUCTIVE' : 'SIDE_EFFECT', categoria, efeitos })) });
  definirCapabilities(a, ADM, c.id, ops.map(([id]) => ({ operation_id: id })));
  for (const s of ['TESTING', 'REVIEW_REQUIRED']) mudarStatus(a, lerConector(a, c.id), s, 1);
  exec(a.db, 'update connectors set aprovado_versao = versao where id = ?', c.id);
  mudarStatus(a, lerConector(a, c.id), 'APPROVED', 1);
  exec(a.db, "update capabilities set status = 'ativa' where connector_id = ?", c.id);
  mudarStatus(a, lerConector(a, c.id), 'ACTIVE', 1);
  return c;
}
const estados = r => r.map(n => [n.categoria, n.estado]);

test('caso Financeiro: conciliar recebimentos (leitura liberada), lançar baixa (aprovação), apagar título (negado)', () => {
  const a = app();
  ativo(a, 'Sistema Financeiro', [['listarRecebimentos', 'GET', 'read_data', { read: true, financial: false }], ['lancarBaixa', 'POST', 'create_record', { write: true, financial: true }], ['apagarTitulo', 'DELETE', 'delete_record', { write: true, irreversible: true }]]);
  const pedido = 'Consulte os recebimentos do dia no sistema financeiro, lance a baixa dos títulos pagos no sistema financeiro e apague os títulos duplicados no sistema financeiro.';
  const r = resolverNecessidades(a, necessidadesDoPedido(pedido), { pessoa: ADM });
  assert.deepEqual(estados(r), [['read_data', 'disponivel'], ['create_record', 'requer_aprovacao'], ['delete_record', 'nao_permitido']]);
  const p = criarPlano(a, ADM, { necessidades: necessidadesDoPedido(pedido) });
  assert.deepEqual(p.passos.map(x => x.depende_de), [[], ['n1'], ['n2']]);
  assert.equal(p.estado.passos.n3.status, 'BLOCKED');
});

test('caso Gestão: indicadores do BI (leitura), tarefa no gerenciador de projetos (aprovação), sistema sem integração (configurar)', () => {
  const a = app();
  ativo(a, 'Metabase', [['indicadores', 'GET', 'read_data', { read: true }]]);
  ativo(a, 'Asana', [['criarTarefa', 'POST', 'create_record', { write: true }]]);
  const pedido = 'Busque os indicadores do mês no Metabase, crie uma tarefa de plano de ação no Asana e envie o resumo por e-mail pelo Outlook.';
  const r = resolverNecessidades(a, necessidadesDoPedido(pedido), { pessoa: ADM });
  assert.deepEqual(estados(r), [['read_data', 'disponivel'], ['create_record', 'requer_aprovacao'], ['send_message', 'configurar']]);
  assert.match(r[2].motivo, /Nenhuma integração/);
});

test('caso RH/Administrativo: dado pessoal pede aprovação até na leitura; política da empresa (dados) libera o que ela decidir', () => {
  const a = app();
  ativo(a, 'Sistema de RH', [['listarColaboradores', 'GET', 'read_data', { read: true, personal_data: true }], ['registrarFerias', 'POST', 'create_record', { write: true, personal_data: true }]]);
  const pedido = 'Consulte os colaboradores com férias vencidas no sistema de RH e registre as férias programadas no sistema de RH.';
  assert.deepEqual(estados(resolverNecessidades(a, necessidadesDoPedido(pedido), { pessoa: ADM })), [['read_data', 'requer_aprovacao'], ['create_record', 'requer_aprovacao']]);
  // A empresa decide (dado, não código): leitura de RH liberada; a escrita continua com aprovação.
  salvarConfig(a.db, { integracoes: { ativa: true, pessoas: [], politicas: [{ quando: { modo: 'read', sistema: 'Sistema de RH' }, decisao: 'ALLOW' }], limite_minuto_empresa: 300, rede_privada_autorizada: false } });
  assert.deepEqual(estados(resolverNecessidades(a, necessidadesDoPedido(pedido), { pessoa: ADM })), [['read_data', 'disponivel'], ['create_record', 'requer_aprovacao']]);
});

// Os três fluxos de negócio da missão, ponta a ponta na resolução (sem regra de setor): cada etapa vira uma
// capability com o estado que a política e o catálogo da empresa dão; o plano respeita a ordem pedida.
test('fluxo Financeiro: negócio concluído → validação → emissão do documento → envio → registro', () => {
  const a = app();
  ativo(a, 'CRM', [['negociosConcluidos', 'GET', 'read_data', { read: true }], ['registrarEnvio', 'POST', 'create_record', { write: true }]]);
  ativo(a, 'ERP', [['dadosCobranca', 'GET', 'read_data', { read: true }]]);
  ativo(a, 'Sistema Fiscal', [['emitirNota', 'POST', 'generate_document', { write: true, financial: true, external_side_effect: true }]]);
  const pedido = 'Consulte os negócios concluídos no CRM, confirme os dados de cobrança no ERP, emita a nota fiscal no sistema fiscal, envie a nota ao cliente por e-mail e registre o envio no CRM.';
  const n = necessidadesDoPedido(pedido);
  assert.deepEqual(estados(resolverNecessidades(a, n, { pessoa: ADM })),
    [['read_data', 'disponivel'], ['read_data', 'disponivel'], ['generate_document', 'requer_aprovacao'], ['send_message', 'configurar'], ['create_record', 'requer_aprovacao']]);
  const p = criarPlano(a, ADM, { necessidades: n });
  assert.deepEqual(p.passos.map(x => x.depende_de), [[], ['n1'], ['n2'], ['n3'], ['n4']]);
  // E-mail sem integração: a etapa fica bloqueada e o registro depois dela também (não segue no escuro).
  assert.equal(p.estado.passos.n4.status, 'BLOCKED');
});

test('fluxo Gestão: dados → indicador → alerta → responsável → decisão', () => {
  const a = app();
  ativo(a, 'ERP', [['vendasDia', 'GET', 'read_data', { read: true }]]);
  ativo(a, 'Metabase', [['margem', 'GET', 'read_data', { read: true }]]);
  ativo(a, 'Slack', [['alerta', 'POST', 'send_message', { write: true, communication: true }]]);
  ativo(a, 'Asana', [['decisao', 'POST', 'create_record', { write: true }]]);
  const n = necessidadesDoPedido('Consulte as vendas do dia no ERP, verifique o indicador de margem no Metabase, envie um alerta pelo Slack ao responsável e registre a decisão no Asana.');
  assert.deepEqual(estados(resolverNecessidades(a, n, { pessoa: ADM })), [['read_data', 'disponivel'], ['read_data', 'disponivel'], ['send_message', 'requer_aprovacao'], ['create_record', 'requer_aprovacao']]);
});

test('fluxo RH/Administrativo: entrada → validação → encaminhamento → acompanhamento → conclusão', () => {
  const a = app();
  ativo(a, 'Portal do Colaborador', [['solicitacoes', 'GET', 'read_data', { read: true }], ['encerrar', 'PATCH', 'update_record', { write: true }]]);
  ativo(a, 'Sistema de RH', [['documentos', 'GET', 'read_data', { read: true }], ['andamento', 'PATCH', 'update_record', { write: true }]]);
  const n = necessidadesDoPedido('Consulte as solicitações recebidas no portal do colaborador, confira os documentos no sistema de RH, encaminhe a solicitação ao gestor pelo Teams, atualize o andamento no sistema de RH e encerre a solicitação no portal do colaborador.');
  assert.deepEqual(estados(resolverNecessidades(a, n, { pessoa: ADM })),
    [['read_data', 'disponivel'], ['read_data', 'disponivel'], ['send_message', 'configurar'], ['update_record', 'requer_aprovacao'], ['update_record', 'requer_aprovacao']]);
});

test('nome composto após sistema e referência ao mesmo sistema resolvem o conector aprovado', () => {
  const a = app();
  ativo(a, 'Sandbox Tarefas', [['tarefas', 'GET', 'read_data', { read: true }], ['notas', 'POST', 'create_record', { write: true }]]);
  const n = necessidadesDoPedido('Consulte tarefas no sistema Sandbox Tarefas e faça um resumo. Depois registre uma nota fictícia no mesmo sistema, somente após aprovação humana. Não apagar registros.');
  assert.deepEqual(n.map(x => [x.categoria, x.modo]), [['read_data', 'read'], ['create_record', 'write']]);
  assert.deepEqual(estados(resolverNecessidades(a, n, { pessoa: ADM })), [['read_data', 'disponivel'], ['create_record', 'requer_aprovacao']]);
  assert.deepEqual(n[1].depende_de, ['n1']);
  assert.deepEqual(necessidadesDoPedido('Registre uma nota no mesmo sistema.'), [], 'sem antecedente não inventa destino');
  assert.deepEqual(necessidadesDoPedido('Crie uma legenda no Instagram.'), [], 'canais de conteúdo continuam sem integração');
  a.db.close();
});
