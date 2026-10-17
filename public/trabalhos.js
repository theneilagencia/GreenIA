// Descrições de atividades, sem nomes, trechos ou dados privados do pedido.
export const EXEMPLOS_TRABALHO = [
 ['Comunicação e tarefas do dia a dia','Escrever e-mails, revisar textos, resumir documentos e organizar informações.'],
 ['Análise e preparação de materiais','Comparar propostas, analisar planilhas e preparar relatórios ou apresentações com base em arquivos.'],
 ['Trabalhos com várias etapas','Cruzar informações de documentos, investigar divergências e preparar materiais que combinem análise e geração de arquivos.'],
];
export function trabalhoDoPedido(corpo={},requisitos={}) {
 const texto=String(corpo.texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const n=Array.isArray(corpo.anexos)?corpo.anexos.length:Number(corpo.quantidadeAnexos)||0;
 const atividades=[];
 if(/\b(compar\w*|cruz\w*|diverg\w*)/.test(texto))atividades.push('comparar informações e conferir diferenças');
 if(/\b(calcul\w*|formul\w*|projec\w*)/.test(texto))atividades.push('trabalhar com cálculos e suas premissas');
 if(/\b(pptx|powerpoint|slides?|apresentacao)\b/.test(texto))atividades.push('organizar o conteúdo e montar uma apresentação em slides');
 if(/\b(xlsx|excel|planilhas?)\b/.test(texto))atividades.push('montar ou revisar uma planilha');
 if(/\b(relatorios?|parecer\w*|propostas?|documento consolidado)\b/.test(texto))atividades.push('organizar as informações em um documento');
 if(/\b(codigo|aplicativo|sistema|site|programacao)\b/.test(texto))atividades.push('planejar ou desenvolver código');
 if(n>1)atividades.unshift(`analisar ${n} arquivos enviados`);
 else if(n===1)atividades.unshift('analisar o arquivo enviado');
 if(requisitos.dimensoes?.leitura_longa||requisitos.janelaMinima>32768)atividades.push('consultar um volume extenso de informações');
 if(!atividades.length)atividades.push('organizar informações e executar as etapas do pedido');
 const etapas=[...new Set(atividades)].slice(0,4);
 const lista=etapas.length===1?etapas[0]:etapas.slice(0,-1).join(', ')+' e '+etapas.at(-1);
 let alternativa;
 if(/slides|apresentacao|pptx|powerpoint/.test(texto))alternativa={titulo:'Preparar um roteiro em texto',descricao:'Organizar uma sugestão de sequência e tópicos para os slides, em até 600 palavras.',limites:'Não inclui montar o PowerPoint, aplicar o layout ou gerar os arquivos da apresentação.'};
 else if(/xlsx|excel|planilha/.test(texto))alternativa={titulo:'Planejar a planilha em texto',descricao:'Descrever as abas, colunas e informações a organizar, em até 600 palavras.',limites:'Não inclui gerar a planilha, executar cálculos ou conferir fórmulas.'};
 else if(n)alternativa={titulo:'Resumir o material em texto',descricao:'Produzir um resumo descritivo dos materiais enviados, em até 600 palavras no total.',limites:'Não inclui comparar documentos, consolidar divergências, realizar cálculos ou gerar arquivos finais.'};
 else alternativa={titulo:'Organizar um roteiro do trabalho',descricao:'Listar as etapas e informações necessárias para realizar o pedido, em até 600 palavras.',limites:'Não inclui executar essas etapas, fazer cálculos, gerar arquivos finais ou agir em outros sistemas.'};
 alternativa.instrucao=`${alternativa.descricao} Escopo reduzido escolhido pelo usuário: ${alternativa.limites} Entregue somente esse conteúdo em texto e identifique o que ficou pendente do pedido original.`;
 return {etapas,justificativa:`Este pedido envolve ${lista}. O GreenIA identificou que precisa usar o Advanced para executar essas etapas neste trabalho. Esse acesso depende da liberação do administrador.`,alternativa};
}
