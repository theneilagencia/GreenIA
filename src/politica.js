// Política de Uso de IA: o texto é do cliente (editado pelo admin); a plataforma
// acrescenta no fim a seção "Como a GreenIA trata dados sigilosos", gerada da
// configuração atual. Mudou a seção (modelo homologado, acesso, regra), nova
// versão, e todos registram ciência de novo. Preço não entra na seção.
import { erro } from './http.js';
import { exec, todos, um } from './db.js';
import { lerConfig } from './config.js';
import { registrar } from './eventos.js';
import { lerModelos, PERFIS } from './modelos.js';

export const TEXTO_PADRAO = `## Para que serve a GreenIA
A GreenIA é a assistente de IA da empresa para tarefas do dia a dia: resumir, rascunhar, conferir, organizar e tirar dúvidas.

## O que você pode fazer
- Usar o chat e os quick wins das suas áreas para o seu trabalho.
- Anexar documentos de trabalho, seguindo as regras de dados abaixo.

## O que você não pode fazer
- Enviar senhas, tokens ou qualquer credencial.
- Usar a IA para decidir sozinha: toda resposta deve ser revisada por você antes de ser usada.

## Dúvidas
Na dúvida sobre o que pode ser enviado, fale com o responsável da sua área.`;

const data = iso => new Date(iso).toLocaleDateString('pt-BR');

export function secaoAutomatica(app) {
  const cfg = lerConfig(app.db);
  const modelos = lerModelos(app.db);
  const homologados = modelos.filter(m => m.liberado && m.homologado);
  const nomeGrupo = id => um(app.db, 'select nome from grupos where id = ?', id)?.nome;
  const nomeArea = id => um(app.db, 'select nome from areas where id = ?', id)?.nome;
  const acesso = p => {
    const a = cfg.acessoPerfis[p] || {};
    if (a.todos) return 'todas as pessoas';
    const quem = [...(a.grupos || []).map(nomeGrupo), ...(a.areas || []).map(nomeArea)].filter(Boolean);
    return quem.length ? quem.join(', ') : 'ninguém';
  };
  const areasSigilosas = todos(app.db, 'select nome from areas where sigilosa = 1 order by nome').map(a => a.nome);
  return [
    '## Como a GreenIA trata dados sigilosos',
    'Esta seção é gerada pela plataforma a partir da configuração atual.',
    '### Conversa normal e conversa sigilosa',
    '- **Conversa normal:** não tem dados sigilosos. Pode usar todos os modelos liberados para você.',
    '- **Conversa sigilosa:** tem dados pessoais, de clientes, financeiros confidenciais, jurídicos, estratégicos ou qualquer outro que esta política classifique como sigiloso. Usa só modelos homologados, com o fornecedor fixado e sem retenção dos dados.',
    '### Quando uma conversa vira sigilosa',
    '1. Quando você liga a opção "Esta conversa tem dados sigilosos".',
    '2. Quando o quick win é classificado como "trata dados sigilosos".',
    '3. Quando o sistema encontra um tipo de dado marcado como "permitir" (por exemplo CPF, CNPJ, dados bancários, email, telefone ou endereço), na mensagem ou em um anexo.',
    '4. Quando a conversa usa um documento de base ou arquivo de quick win marcado como sigiloso.',
    `5. Quando a sua área tem a opção "todas as conversas desta área são sigilosas"${areasSigilosas.length ? ` (hoje: ${areasSigilosas.join(', ')})` : ''}.`,
    'Uma conversa sigilosa continua sigilosa até ser apagada.',
    '### Modelos homologados para dados sigilosos',
    ...(homologados.length ? homologados.map(m => `- ${m.nome} (fornecedor ${m.homologacao?.fornecedor || '?'}), homologado em ${data(m.homologacao?.em)}`) : ['- Nenhum modelo homologado ainda. Enquanto isso, conversas sigilosas não podem ser enviadas.']),
    '### Quem usa cada perfil de modelo',
    `- ${PERFIS.rapido}: todas as pessoas.`,
    `- ${PERFIS.equilibrado}: ${acesso('equilibrado')}.`,
    `- ${PERFIS.avancado}: ${acesso('avancado')}.`,
    '### O sistema não reconhece tudo',
    'Números estratégicos, nomes soltos e informações de negócio não são reconhecidos automaticamente. Se houver dado sigiloso que o sistema não reconhece, ligue a opção "Esta conversa tem dados sigilosos" antes de enviar.',
    '### Quem vê o quê e por quanto tempo',
    `- Suas conversas e anexos ficam salvos só para você, por até ${cfg.retencaoDias} dias sem uso, e você pode apagá-los quando quiser.`,
    '- Nem o responsável da área nem o admin leem o conteúdo das conversas: eles veem só dados de uso (quantidade, custo, feedback), sem conteúdo.',
    '- Senhas e credenciais nunca são enviadas.',
  ].join('\n');
}

export function politicaAtual(app) {
  let v = um(app.db, 'select * from politica_versoes order by versao desc limit 1');
  if (!v) {
    exec(app.db, 'insert into politica_versoes (texto, secao, criado_em) values (?, ?, ?)', TEXTO_PADRAO, secaoAutomatica(app), app.agora().toISOString());
    v = um(app.db, 'select * from politica_versoes order by versao desc limit 1');
  }
  return v;
}

// Nova versão se a seção automática mudou. Chamada depois de mudanças em modelos, acesso, áreas e retenção.
export function sincronizarPolitica(app, pessoaId = null) {
  const atual = politicaAtual(app);
  const secao = secaoAutomatica(app);
  if (secao === atual.secao) return false;
  exec(app.db, 'insert into politica_versoes (texto, secao, criado_em, criado_por) values (?, ?, ?, ?)', atual.texto, secao, app.agora().toISOString(), pessoaId);
  registrar(app, 'politica_versao', pessoaId, { motivo: 'secao_automatica' });
  return true;
}

export function rotasPolitica(app, r) {
  const anterior = app.aoMudarModelos;
  app.aoMudarModelos = () => { anterior?.(); sincronizarPolitica(app); };

  r.get('/api/politica', ({ sessao }) => {
    const v = politicaAtual(app);
    return { versao: v.versao, texto: v.texto, secao: v.secao, atualizada_em: v.criado_em, cienciaPendente: sessao ? sessao.pessoa.ciencia_versao < v.versao : undefined };
  }, { publica: true });

  r.post('/api/politica/ciencia', ({ pessoa, corpo }) => {
    const v = politicaAtual(app);
    if (Number(corpo.versao) !== v.versao) throw erro(409, 'versao', 'A política mudou. Recarregue e leia a versão nova.');
    exec(app.db, 'update pessoas set ciencia_versao = ? where id = ?', v.versao, pessoa.id);
    registrar(app, 'politica_ciencia', pessoa.id, { versao: v.versao });
    return { ok: true };
  });

  r.put('/api/admin/politica', ({ pessoa, corpo }) => {
    const texto = String(corpo.texto || '').trim();
    if (texto.length < 20) throw erro(400, 'texto', 'Escreva o texto da política.');
    exec(app.db, 'insert into politica_versoes (texto, secao, criado_em, criado_por) values (?, ?, ?, ?)', texto.slice(0, 50000), secaoAutomatica(app), app.agora().toISOString(), pessoa.id);
    registrar(app, 'politica_versao', pessoa.id, { motivo: 'texto' });
    return { ok: true };
  }, { admin: true });

  r.get('/api/admin/politica/versoes', () => ({
    versoes: todos(app.db, 'select v.versao, v.criado_em, p.email as por, (select count(*) from pessoas where ciencia_versao >= v.versao and ativo = 1) as ciencias from politica_versoes v left join pessoas p on p.id = v.criado_por order by v.versao desc limit 50'),
    pessoas: um(app.db, 'select count(*) as n from pessoas where ativo = 1').n,
  }), { admin: true });
}

export const cienciaPendente = (app, pessoa) => pessoa.ciencia_versao < politicaAtual(app).versao;
