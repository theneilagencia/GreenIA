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


// Ambiente de empresa da plataforma (white label): texto padrão escrito para a marca da empresa (a troca automática
// do nome gerava "A IA é a assistente de IA"); a seção automática não cita a plataforma.
export const TEXTO_PADRAO_EMPRESA = `## Para que serve a IA da empresa
A IA da empresa ajuda nas tarefas do dia a dia: resumir, rascunhar, conferir, organizar e tirar dúvidas.

## O que você pode fazer
- Usar o chat e os Quick Wins das suas áreas para o seu trabalho.
- Anexar documentos de trabalho, seguindo as regras de dados abaixo.

## O que você não pode fazer
- Enviar senhas, tokens ou qualquer credencial.
- Usar a IA para decidir sozinha: toda resposta deve ser revisada por você antes de ser usada.

## Dúvidas
Na dúvida sobre o que pode ser enviado, fale com o responsável da sua área.`;
const paraAmbiente = (app, t) => (app.tenant ? semMarcaDaPlataforma(t) : t);
const textoPadrao = app => (app.tenant ? TEXTO_PADRAO_EMPRESA : TEXTO_PADRAO);

export function secaoAutomatica(app) {
  return paraAmbiente(app, montarSecao(app));
}
function montarSecao(app) {
  const cfg = lerConfig(app.db);
  const nomeGrupo = id => um(app.db, 'select nome from grupos where id = ?', id)?.nome;
  const nomeArea = id => um(app.db, 'select nome from areas where id = ?', id)?.nome;
  // Quem fala pela plataforma: no ambiente de uma empresa, "a plataforma" (a troca automática daria "a IA aplica
  // controles administrativos").
  const plataforma = app.tenant ? 'a plataforma' : 'a GreenIA';
  const Plataforma = plataforma[0].toUpperCase() + plataforma.slice(1);
  const acesso = p => {
    const a = cfg.acessoPerfis[p] || {};
    if (a.todos) return 'todas as pessoas';
    const quem = [...(a.grupos || []).map(nomeGrupo), ...(a.areas || []).map(nomeArea)].filter(Boolean);
    return quem.length ? quem.join(', ') : '';
  };
  // Nível sem ninguém com acesso não entra na lista ("Avançado: ninguém" soava como erro); a nota explica a ausência.
  const niveis = [[PERFIS.rapido, 'todas as pessoas'], [PERFIS.equilibrado, acesso('equilibrado')], [PERFIS.avancado, acesso('avancado')]].filter(([, q]) => q);
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
      ? `A empresa permite o processamento de informações sigilosas com guardrails de proteção: antes de cada envio, ${plataforma} aplica os controles de proteção da empresa e só usa recursos de IA autorizados para esse tipo de informação. Quando não há um recurso autorizado disponível, nada é enviado.`
      : 'A empresa não permite processar informações sigilosas com IA: mensagens com esse tipo de informação não são enviadas.'}`,
    '### Quando uma conversa vira sigilosa',
    '1. Quando você liga a opção "Esta conversa tem dados sigilosos".',
    '2. Quando o quick win é classificado como "trata informações sigilosas".',
    `3. Quando o sistema encontra, na mensagem ou em um anexo, um tipo de dado que a empresa trata com proteção${protegidos.length ? ` (hoje: ${protegidos.join(', ')})` : ''}.`,
    '4. Quando a conversa usa um documento de base ou arquivo de quick win marcado como sigiloso.',
    `5. Quando a sua área tem proteção reforçada${areasSigilosas.length ? ` (hoje: ${areasSigilosas.join(', ')})` : ''} e o conteúdo tem marcação de confidencialidade, dado pessoal sensível (como saúde) ou dado de pessoas em processo interno (como remuneração ou desligamento). Nessas áreas, o que não for sigiloso segue as regras gerais.`,
    'Uma conversa sigilosa continua sigilosa até ser apagada.',
    '### Dados pessoais no dia a dia',
    'Você pode escrever normalmente: nomes, cargos, emails e telefones de trabalho e outros dados do dia a dia seguem as regras gerais da empresa. Antes de cada envio, o sistema confere a mensagem e os anexos dela e aplica a regra da empresa para cada tipo de dado que reconhece, sem que você precise tirar nada do texto.',
    '### O que é conferido em cada parte do envio',
    '- **Mensagem e anexos (inclusive o texto lido de imagens e PDFs escaneados):** regras da empresa para cada tipo de dado reconhecido, e bloqueio de senhas e chaves de acesso.',
    '- **Documentos da base e arquivos de quick win:** marcação de sigiloso de cada documento e bloqueio de senhas e chaves de acesso. As regras por tipo de dado não se aplicam a eles.',
    '- **Histórico da conversa e instruções:** bloqueio de senhas e chaves de acesso.',
    ...(naoEnviados.length ? ['### Dados que a empresa não envia à IA', `Por política da empresa, mensagens com ${naoEnviados.join(', ')} não são enviadas.`] : []),
    '### Quem usa cada nível',
    ...niveis.map(([nivel, quem]) => `- ${nivel}: ${quem}.`),
    ...(niveis.length < 3 ? ['Os níveis que não aparecem na lista não estão liberados nesta empresa.'] : []),
    '### O sistema não reconhece tudo',
    'Números estratégicos, nomes soltos e informações de negócio não são reconhecidos automaticamente. Se houver informação sigilosa que o sistema não reconhece, ligue a opção "Esta conversa tem dados sigilosos" antes de enviar.',
    '### Quem vê o quê e por quanto tempo',
    `- Suas conversas e anexos ficam guardados no banco de dados da empresa por até ${cfg.retencaoDias} dias sem uso, e você pode apagá-los quando quiser.${(cfg.naoArmazenar || []).length ? ' Mensagens com um tipo de dado que a empresa manda não guardar são processadas sem ficar no histórico.' : ''}`,
    '- Nenhuma tela da GreenIA mostra o conteúdo das suas conversas a colegas, ao responsável da área ou ao admin da empresa: nas telas, eles veem só dados de uso (quantidade, consumo, feedback).',
    '- O conteúdo fica no banco de dados da empresa. A equipe técnica da GreenIA tem acesso ao servidor para dar suporte e pode exportar uma cópia do banco da empresa; a entrada no ambiente pela plataforma e a exportação ficam registradas.',
    '- Uma conversa apagada sai do banco de dados. Cópias de segurança feitas antes da exclusão ainda podem conter a conversa até serem substituídas pela rotina de backup.',
    '- Senhas, tokens e chaves de acesso em formatos que o sistema reconhece bloqueiam o envio, em qualquer parte do pedido: mensagem, anexos, histórico, instruções, documentos da base e arquivos de quick win. É uma regra de segurança da GreenIA, que a empresa não desliga. Um segredo num formato que o sistema não reconhece pode passar: não envie credenciais.',
    '### Responsabilidades',
    `${Plataforma} aplica controles técnicos e administrativos para apoiar as políticas de segurança, confidencialidade e proteção de dados da empresa. A empresa continua responsável por suas obrigações legais e regulatórias.`,
  ].join('\n');
}

export function politicaAtual(app) {
  let v = um(app.db, 'select * from politica_versoes order by versao desc limit 1');
  if (!v) {
    exec(app.db, 'insert into politica_versoes (texto, secao, criado_em) values (?, ?, ?)', textoPadrao(app), secaoAutomatica(app), app.agora().toISOString());
    v = um(app.db, 'select * from politica_versoes order by versao desc limit 1');
  } else if (app.tenant && (v.texto === TEXTO_PADRAO || v.texto === semMarcaDaPlataforma(TEXTO_PADRAO))) {
    // Empresa que ainda usa um texto padrão anterior (com o nome da plataforma, ou a troca automática que gerava
    // "A IA é a assistente de IA"): nova versão com o texto da empresa, registrada; todos dão ciência de novo.
    exec(app.db, 'insert into politica_versoes (texto, secao, criado_em) values (?, ?, ?)', textoPadrao(app), secaoAutomatica(app), app.agora().toISOString());
    registrar(app, 'policy.updated', null, { motivo: 'marca_da_empresa' });
    v = um(app.db, 'select * from politica_versoes order by versao desc limit 1');
  } else if (app.tenant && !conferidas.has(app.db) && v.secao !== secaoAutomatica(app)) {
    // Uma vez por subida: a redação da seção automática mudou no código (ex.: "a plataforma aplica…" no lugar de
    // "a IA aplica…"). O texto da empresa fica; a seção é atualizada numa nova versão, com nova ciência.
    exec(app.db, 'insert into politica_versoes (texto, secao, criado_em) values (?, ?, ?)', v.texto, secaoAutomatica(app), app.agora().toISOString());
    registrar(app, 'policy.updated', null, { motivo: 'secao_automatica' });
    v = um(app.db, 'select * from politica_versoes order by versao desc limit 1');
  }
  if (app.tenant) conferidas.add(app.db);
  return v;
}
const conferidas = new WeakSet();   // bancos de empresa cuja seção automática já foi conferida nesta subida

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
