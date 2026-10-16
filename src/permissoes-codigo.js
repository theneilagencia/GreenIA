// Código e sites com controle proporcional ao risco. Conversar sobre programação, explicar código, dar exemplos em
// texto e analisar trechos sem executar é livre (política geral da empresa). O que vira operação protegida tem
// permissão própria, independente, dada pelo admin no perfil:
//   code.project  — criar, exportar e editar projetos de sites e aplicativos (prévia isolada e código em .zip)
//   code.execute  — executar código ou testes (área isolada no navegador; src/codigo-operacoes.js)
//   code.repo     — acessar ou modificar repositórios (GitHub conectado pelo admin; alteração = Pull Request)
//   code.publish  — publicar ou fazer deploy (endereço público isolado na GreenIA)
// A política da empresa (cfg.desenvolvimento[op] === false) proíbe por cima de qualquer perfil. A decisão é do
// servidor, a cada mensagem (revogar vale para as conversas já abertas); a escolha de modelo não muda nada aqui.
export const OPERACOES_CODIGO = {
  projeto: { chave: 'code.project', nome: 'Criar sites e aplicativos', disponivel: true },
  executar: { chave: 'code.execute', nome: 'Executar código', disponivel: true },
  repositorio: { chave: 'code.repo', nome: 'Acessar repositórios de código', disponivel: true },
  publicar: { chave: 'code.publish', nome: 'Publicar projetos', disponivel: true },
};
export const CHAVES_CODIGO = Object.values(OPERACOES_CODIGO).map(o => o.chave);

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ARTEFATO = /\b(sites?|landing ?pages?|pagina (web|de captura|de vendas|institucional)|aplica(cao|coes|tivo|tivos)|apps?|sistema (web)?|plataforma web|software|projeto|portal|loja virtual|dashboard web|api)\b/;
const CRIAR = /\b(cri[ae]\w*|desenvolv\w*|constru\w*|mont\w*|ger[ae]\w*|fa[cç]a|fazer|program\w*|implement\w*|entregue|codifique)\b/;
// Pedido de estudo ou de exemplo curto: resposta em texto, não projeto.
const EXEMPLO = /\b(exemplo|exemplos|para (eu )?(estudar|aprender|entender)|trecho|snippet|pequeno|simples para (estudo|aprender)|como (se )?faz|como funciona|explique|explicar|o que (e|faz|significa))\b/;
const PROJETO_EXPLICITO = /\b(codigo[- ]fonte completo|projeto (completo|executavel)|com previa|arquivos do projeto|entregue o projeto|instrucoes de instalacao)\b/;
const MEXER_PROJETO = /\b(refator\w*|corrij\w*|corrigir|melhore|altere|edite|acrescente|adicione|atualize)\b/;
const EXECUTAR = /\b(execute|executar|executa|rode|rodar|roda|run|rodando)\b(?!\s+(uma|a) (campanha|reuniao|pesquisa))|\b(teste|testar|testa) (o|este|esse|meu) (codigo|script|programa)|\b(rode|rodar|execute|executar) (os |as )?(testes|test)\b/;
const REPOSITORIO = /\b(repositorio|repositorios|github|gitlab|bitbucket|pull request|merge request|commit|commits|fa[cç]a (o )?clone|git push)\b/;
const PUBLICAR = /\b(publi(que|car|ca)|deploy|coloque no ar|colocar no ar|no ar na internet|hosped\w*|subir? para produ\w*|em produ[cç][aã]o|apontar o dominio|registr\w* o dominio)\b/;

/**
 * Operações protegidas que a mensagem pede. conversaTemProjeto: a conversa já tem site ou projeto gerado (aí
 * "publique", "execute os testes" ou "refatore" falam dele). Explicar, exemplificar e analisar trecho não entram.
 */
export function operacoesDeCodigo(texto, { anexos = [], conversaTemProjeto = false } = {}) {
  const t = norm(texto), ops = new Set();
  const projetoAnexado = anexos.some(a => /^Projeto compactado com/.test(String(a.texto || '')));
  const sobreCodigo = ARTEFATO.test(t) || projetoAnexado || conversaTemProjeto || /\b(codigo|script|programa|python|javascript|node|funcao|funcoes|classe|testes unitarios|testes automatizados)\b/.test(t);
  if (PROJETO_EXPLICITO.test(t) || (CRIAR.test(t) && ARTEFATO.test(t) && !EXEMPLO.test(t)) || ((projetoAnexado || conversaTemProjeto) && MEXER_PROJETO.test(t))) ops.add('projeto');
  if (sobreCodigo && EXECUTAR.test(t)) ops.add('executar');
  if (REPOSITORIO.test(t)) ops.add('repositorio');
  if ((ARTEFATO.test(t) || conversaTemProjeto) && PUBLICAR.test(t)) ops.add('publicar');
  return [...ops];
}

// Situação de cada operação para esta pessoa: 'permitida' | 'sem_permissao' | 'proibida_pela_empresa'.
// Sem lista de permissões (instalação de uma empresa só, sem perfis): criar projetos vale para todos, como antes; as
// demais operações, só para o admin.
export function situacaoDaOperacao(op, pessoa, cfg = {}) {
  const o = OPERACOES_CODIGO[op];
  if (cfg.desenvolvimento?.[op] === false) return 'proibida_pela_empresa';
  if (!Array.isArray(pessoa?.permissoes)) return op === 'projeto' || pessoa?.admin ? 'permitida' : 'sem_permissao';
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
  const permitidas = new Set(d.itens.filter(i => i.situacao === 'permitida' && i.disponivel).map(i => i.op));
  if (permitidas.has('executar')) linhas.push('Execução de código: assim que esta resposta terminar, a GreenIA executa o projeto numa área isolada do navegador da pessoa (JavaScript, ou Python pelo Pyodide) e mostra a saída real logo abaixo; a saída fica disponível para a próxima mensagem. Entregue o código completo, cada arquivo com "### Arquivo: caminho" seguido do bloco de código (testes: Python em test_*.py com unittest ou funções test_; JavaScript em *.test.js com node:test e node:assert). Não invente nem antecipe a saída da execução. Só os arquivos do projeto e a biblioteca padrão estão disponíveis (sem rede; pacotes JavaScript externos não).');
  if (permitidas.has('repositorio')) linhas.push('Repositórios: quando um repositório liberado pela empresa estiver no material, use o conteúdo dele. Para alterar, entregue cada arquivo alterado COMPLETO, com "### Arquivo: caminho/no/repositório" seguido do bloco de código; a GreenIA abre um Pull Request com essas mudanças num branch novo (nunca grava direto no branch principal) e mostra o link. Não diga que fez commit ou merge por conta própria.');
  if (permitidas.has('publicar')) linhas.push('Publicação: quando houver um site completo (HTML) nesta conversa, a GreenIA o publica num endereço público logo após a resposta e mostra o link. Não invente endereços. O site publicado não acessa a internet nem envia formulários para fora.');
  const outros = [...d.bloqueadas, ...d.indisponiveis].filter(i => i.op !== 'projeto');
  if (outros.length) linhas.push(`Nesta conversa a plataforma não ${outros.map(i => ({ executar: 'executa código nem testes', repositorio: 'acessa nem modifica repositórios', publicar: 'publica nem faz deploy de projetos' })[i.op]).join(', não ')}. Nunca diga que fez isso nem simule o resultado (saída de execução, link publicado, commit). Faça a parte que for possível e diga com clareza o que ficou pendente.`);
  return linhas.length ? `\n${linhas.join('\n')}` : '';
}
