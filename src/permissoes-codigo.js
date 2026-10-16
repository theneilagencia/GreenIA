// Código e sites com controle proporcional ao risco. Conversar sobre programação, explicar código, dar exemplos em
// texto e analisar trechos sem executar é livre (política geral da empresa). O que vira operação protegida tem
// permissão própria, independente, dada pelo admin no perfil:
//   code.project  — criar, exportar e editar projetos de sites e aplicativos (prévia isolada e código em .zip)
//   code.execute  — executar código ou testes            (a GreenIA ainda não executa código)
//   code.repo     — acessar ou modificar repositórios     (ainda não há conexão com repositórios)
//   code.publish  — publicar ou fazer deploy             (a GreenIA ainda não publica projetos)
// A política da empresa (cfg.desenvolvimento[op] === false) proíbe por cima de qualquer perfil. A decisão é do
// servidor, a cada mensagem (revogar vale para as conversas já abertas); a escolha de modelo não muda nada aqui.
export const OPERACOES_CODIGO = {
  projeto: { chave: 'code.project', nome: 'Criar sites e aplicativos', disponivel: true },
  executar: { chave: 'code.execute', nome: 'Executar código', disponivel: false },
  repositorio: { chave: 'code.repo', nome: 'Acessar repositórios de código', disponivel: false },
  publicar: { chave: 'code.publish', nome: 'Publicar projetos', disponivel: false },
};
export const CHAVES_CODIGO = Object.values(OPERACOES_CODIGO).map(o => o.chave);

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ARTEFATO = /\b(sites?|landing ?pages?|pagina (web|de captura|de vendas|institucional)|aplica(cao|coes|tivo|tivos)|apps?|sistema (web)?|plataforma web|software|projeto|portal|loja virtual|dashboard web|api)\b/;
const CRIAR = /\b(cri[ae]\w*|desenvolv\w*|constru\w*|mont\w*|ger[ae]\w*|fa[cç]a|fazer|program\w*|implement\w*|entregue|codifique)\b/;
// Pedido de estudo ou de exemplo curto: resposta em texto, não projeto.
const EXEMPLO = /\b(exemplo|exemplos|para (eu )?(estudar|aprender|entender)|trecho|snippet|pequeno|simples para (estudo|aprender)|como (se )?faz|como funciona|explique|explicar|o que (e|faz|significa))\b/;
const PROJETO_EXPLICITO = /\b(codigo[- ]fonte completo|projeto (completo|executavel)|com previa|arquivos do projeto|entregue o projeto|instrucoes de instalacao)\b/;
const MEXER_PROJETO = /\b(refator\w*|corrij\w*|corrigir|melhore|altere|edite|acrescente|adicione|atualize)\b/;
const EXECUTAR = /\b(execute|executar|executa|rode|rodar|roda|run|rodando)\b(?!\s+(uma|a) (campanha|reuniao|pesquisa))|\b(teste|testar|testa) (o|este|esse|meu) (codigo|script|programa)|\brodar os testes\b/;
const REPOSITORIO = /\b(repositorio|repositorios|github|gitlab|bitbucket|pull request|merge request|commit|commits|fa[cç]a (o )?clone|git push)\b/;
const PUBLICAR = /\b(publi(que|car|ca)|deploy|coloque no ar|colocar no ar|no ar na internet|hosped\w*|subir? para produ\w*|em produ[cç][aã]o|apontar o dominio|registr\w* o dominio)\b/;

/**
 * Operações protegidas que a mensagem pede. conversaTemProjeto: a conversa já tem site ou projeto gerado (aí
 * "publique", "execute os testes" ou "refatore" falam dele). Explicar, exemplificar e analisar trecho não entram.
 */
export function operacoesDeCodigo(texto, { anexos = [], conversaTemProjeto = false } = {}) {
  const t = norm(texto), ops = new Set();
  const projetoAnexado = anexos.some(a => /^Projeto compactado com/.test(String(a.texto || '')));
  const sobreCodigo = ARTEFATO.test(t) || projetoAnexado || conversaTemProjeto || /\b(codigo|script|programa)\b/.test(t);
  if (PROJETO_EXPLICITO.test(t) || (CRIAR.test(t) && ARTEFATO.test(t) && !EXEMPLO.test(t)) || ((projetoAnexado || conversaTemProjeto) && MEXER_PROJETO.test(t))) ops.add('projeto');
  if (sobreCodigo && EXECUTAR.test(t)) ops.add('executar');
  if (REPOSITORIO.test(t)) ops.add('repositorio');
  if ((ARTEFATO.test(t) || conversaTemProjeto) && PUBLICAR.test(t)) ops.add('publicar');
  return [...ops];
}

// Situação de cada operação para esta pessoa: 'permitida' | 'sem_permissao' | 'proibida_pela_empresa'.
// Sem lista de permissões (instalação de uma empresa só, sem perfis), criar projetos vale como antes.
export function situacaoDaOperacao(op, pessoa, cfg = {}) {
  const o = OPERACOES_CODIGO[op];
  if (cfg.desenvolvimento?.[op] === false) return 'proibida_pela_empresa';
  if (!Array.isArray(pessoa?.permissoes)) return op === 'projeto' ? 'permitida' : 'sem_permissao';
  return pessoa.permissoes.includes(o.chave) ? 'permitida' : 'sem_permissao';
}

// Decisão completa para a mensagem: o que pode, o que não pode e o que não existe (com as frases para a tela).
export function decisaoDeCodigo(texto, pessoa, cfg, contexto) {
  const ops = operacoesDeCodigo(texto, contexto);
  const itens = ops.map(op => ({ op, ...OPERACOES_CODIGO[op], situacao: situacaoDaOperacao(op, pessoa, cfg) }));
  return { itens, podeProjeto: situacaoDaOperacao('projeto', pessoa, cfg) === 'permitida', bloqueadas: itens.filter(i => i.situacao !== 'permitida'), indisponiveis: itens.filter(i => i.situacao === 'permitida' && !i.disponivel) };
}

export function avisoDeCodigo(d) {
  const b = d.bloqueadas, x = d.indisponiveis;
  const partes = [];
  if (b.length) partes.push(`Você pode conversar sobre programação, pedir explicações e exemplos de código. ${b.map(i => `"${i.nome}"`).join(' e ')} ${b.length === 1 ? 'depende' : 'dependem'} de ${b.some(i => i.situacao === 'proibida_pela_empresa') ? 'uma regra da empresa que hoje não permite esse uso' : 'o administrador da sua empresa habilitar no seu perfil'}.`);
  if (x.length) partes.push(`${x.map(i => `"${i.nome}"`).join(' e ')} ainda não ${x.length === 1 ? 'está disponível' : 'estão disponíveis'} na GreenIA: nada foi ${x.some(i => i.op === 'publicar') ? 'publicado' : 'executado'}.`);
  return partes.join(' ');
}

// Instrução para a IA: faz a parte permitida e não finge o resto.
export function notaDeCodigo(d) {
  const linhas = [];
  if (d.bloqueadas.some(i => i.op === 'projeto')) linhas.push('A criação de projetos de sites e aplicativos não está liberada para o perfil desta pessoa: não monte o projeto completo (estrutura de arquivos, site inteiro, aplicação inteira). Você pode explicar, orientar e mostrar exemplos curtos de código em texto. Faça o restante do pedido e diga, em uma frase, que criar o projeto depende de o administrador da empresa habilitar "Criar sites e aplicativos" no perfil dela.');
  const outros = [...d.bloqueadas, ...d.indisponiveis].filter(i => i.op !== 'projeto');
  if (outros.length) linhas.push(`Nesta conversa a plataforma não ${outros.map(i => ({ executar: 'executa código nem testes', repositorio: 'acessa nem modifica repositórios', publicar: 'publica nem faz deploy de projetos' })[i.op]).join(', não ')}. Nunca diga que fez isso nem simule o resultado (saída de execução, link publicado, commit). Faça a parte que for possível e diga com clareza o que ficou pendente.`);
  return linhas.length ? `\n${linhas.join('\n')}` : '';
}
