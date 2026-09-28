// Política de Uso de IA: o texto é do cliente (editado pelo admin); a plataforma
// acrescenta no fim a seção "Como a GreenIA trata dados sigilosos", gerada da
// configuração atual. Mudou a seção (modelo homologado, acesso, regra), nova
// versão, e todos registram ciência de novo. Preço não entra na seção.
import { erro } from './http.js';
import { exec, todos, um } from './db.js';
import { lerConfig } from './config.js';
import { registrar } from './eventos.js';
import { PERFIS } from './modelos.js';
import { ROTULOS } from './filtro.js';
import { politicaSigiloLigada } from './sigilo.js';
import { semMarcaDaPlataforma } from '../public/marca-branca.js';

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


// Ambiente de empresa da plataforma (white label): o texto padrão e a seção automática não citam a plataforma.
const paraAmbiente = (app, t) => (app.tenant ? semMarcaDaPlataforma(t) : t);
const textoPadrao = app => paraAmbiente(app, TEXTO_PADRAO);

export function secaoAutomatica(app) {
  return paraAmbiente(app, montarSecao(app));
}
function montarSecao(app) {
  const cfg = lerConfig(app.db);
  const nomeGrupo = id => um(app.db, 'select nome from grupos where id = ?', id)?.nome;
  const nomeArea = id => um(app.db, 'select nome from areas where id = ?', id)?.nome;
  const acesso = p => {
    const a = cfg.acessoPerfis[p] || {};
    if (a.todos) return 'todas as pessoas';
    const quem = [...(a.grupos || []).map(nomeGrupo), ...(a.areas || []).map(nomeArea)].filter(Boolean);
    return quem.length ? quem.join(', ') : 'ninguém';
  };
  const areasSigilosas = todos(app.db, 'select nome from areas where sigilosa = 1 and ativa = 1 order by nome').map(a => a.nome);
  const ligada = politicaSigiloLigada(cfg);
  const protegidos = Object.entries(cfg.acoesChat).filter(([t, v]) => t !== 'credencial' && v === 'proteger').map(([t]) => ROTULOS[t]);
  const naoEnviados = Object.entries(cfg.acoesChat).filter(([t, v]) => t !== 'credencial' && v === 'bloquear').map(([t]) => ROTULOS[t]);
  return [
    '## Como a GreenIA trata informações sigilosas',
    'Esta seção é gerada pela plataforma a partir da configuração atual da empresa.',
    '### Conversa normal e conversa sigilosa',
    '- **Conversa normal:** não tem informação sigilosa.',
    `- **Conversa sigilosa:** tem dados pessoais, de clientes, financeiros, jurídicos, estratégicos ou qualquer outro que esta política classifique como sigiloso. ${ligada
      ? 'A empresa permite o processamento de informações sigilosas com guardrails de proteção: antes de cada envio, a GreenIA aplica os controles de proteção da empresa e só usa recursos de IA autorizados para esse tipo de informação. Quando não há um recurso autorizado disponível, nada é enviado.'
      : 'A empresa não permite processar informações sigilosas com IA: mensagens com esse tipo de informação não são enviadas.'}`,
    '### Quando uma conversa vira sigilosa',
    '1. Quando você liga a opção "Esta conversa tem dados sigilosos".',
    '2. Quando o quick win é classificado como "trata informações sigilosas".',
    `3. Quando o sistema encontra, na mensagem ou em um anexo, um tipo de dado que a empresa trata com proteção${protegidos.length ? ` (hoje: ${protegidos.join(', ')})` : ''}.`,
    '4. Quando a conversa usa um documento de base ou arquivo de quick win marcado como sigiloso.',
    `5. Quando a sua área tem proteção reforçada${areasSigilosas.length ? ` (hoje: ${areasSigilosas.join(', ')})` : ''} e o conteúdo tem marcação de confidencialidade, dado pessoal sensível (como saúde) ou dado de pessoas em processo interno (como remuneração ou desligamento). Nessas áreas, o que não for sigiloso segue as regras gerais.`,
    'Uma conversa sigilosa continua sigilosa até ser apagada.',
    '### Dados pessoais no dia a dia',
    'Você pode escrever normalmente: nomes, cargos, emails e telefones de trabalho e outros dados do dia a dia seguem as regras gerais da empresa. A GreenIA analisa o conteúdo antes de cada envio e aplica a proteção quando ela é necessária, sem que você precise tirar nada do texto.',
    ...(naoEnviados.length ? ['### Dados que a empresa não envia à IA', `Por política da empresa, mensagens com ${naoEnviados.join(', ')} não são enviadas.`] : []),
    '### Quem usa cada nível',
    `- ${PERFIS.rapido}: todas as pessoas.`,
    `- ${PERFIS.equilibrado}: ${acesso('equilibrado')}.`,
    `- ${PERFIS.avancado}: ${acesso('avancado')}.`,
    '### O sistema não reconhece tudo',
    'Números estratégicos, nomes soltos e informações de negócio não são reconhecidos automaticamente. Se houver informação sigilosa que o sistema não reconhece, ligue a opção "Esta conversa tem dados sigilosos" antes de enviar.',
    '### Quem vê o quê e por quanto tempo',
    `- Suas conversas e anexos ficam salvos só para você, por até ${cfg.retencaoDias} dias sem uso, e você pode apagá-los quando quiser.`,
    '- Nem o responsável da área nem o admin leem o conteúdo das conversas: eles veem só dados de uso (quantidade, consumo, feedback), sem conteúdo.',
    '- Senhas, chaves de acesso e outros segredos nunca são enviados à IA (regra de segurança da GreenIA).',
    '### Responsabilidades',
    'A GreenIA aplica controles técnicos e administrativos para apoiar as políticas de segurança, confidencialidade e proteção de dados da empresa. A empresa continua responsável por suas obrigações legais e regulatórias.',
  ].join('\n');
}

export function politicaAtual(app) {
  let v = um(app.db, 'select * from politica_versoes order by versao desc limit 1');
  if (!v) {
    exec(app.db, 'insert into politica_versoes (texto, secao, criado_em) values (?, ?, ?)', textoPadrao(app), secaoAutomatica(app), app.agora().toISOString());
    v = um(app.db, 'select * from politica_versoes order by versao desc limit 1');
  } else if (app.tenant && v.texto === TEXTO_PADRAO) {
    // Empresa que ainda usa o texto padrão antigo (com o nome da plataforma): nova versão, sem ele, registrada.
    exec(app.db, 'insert into politica_versoes (texto, secao, criado_em) values (?, ?, ?)', textoPadrao(app), secaoAutomatica(app), app.agora().toISOString());
    registrar(app, 'policy.updated', null, { motivo: 'marca_da_empresa' });
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
  registrar(app, 'policy.updated', pessoaId, { motivo: 'secao_automatica' });
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
    registrar(app, 'policy.acknowledged', pessoa.id, { versao: v.versao });
    return { ok: true };
  });

  r.put('/api/admin/politica', ({ pessoa, corpo }) => {
    const texto = String(corpo.texto || '').trim();
    if (texto.length < 20) throw erro(400, 'texto', 'Escreva o texto da política.');
    exec(app.db, 'insert into politica_versoes (texto, secao, criado_em, criado_por) values (?, ?, ?, ?)', texto.slice(0, 50000), secaoAutomatica(app), app.agora().toISOString(), pessoa.id);
    registrar(app, 'policy.updated', pessoa.id, { motivo: 'texto' });
    return { ok: true };
  }, { admin: true });

  r.get('/api/admin/politica/versoes', () => ({
    versoes: todos(app.db, 'select v.versao, v.criado_em, p.email as por, (select count(*) from pessoas where ciencia_versao >= v.versao and ativo = 1) as ciencias from politica_versoes v left join pessoas p on p.id = v.criado_por order by v.versao desc limit 50'),
    pessoas: um(app.db, 'select count(*) as n from pessoas where ativo = 1').n,
  }), { admin: true });
}

export const cienciaPendente = (app, pessoa) => pessoa.ciencia_versao < politicaAtual(app).versao;
