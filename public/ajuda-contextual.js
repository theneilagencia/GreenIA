import { esc } from '/comum.js';
import { fecharComEscape } from '/acessibilidade.js';
import { E } from '/app.js';
// Ajuda de cada tela: [título, o que fazer, cuidado, perguntas]. As explicações que saíram das telas (padrão "caminho
// claro": nada de explicação permanente na tela) ficam aqui, em perguntas curtas.
const dias = () => Number(E?.retencaoDias) || 90;
// Quem gerencia alguma base vê na tela a ação "Enviar documento" (a permissão vem do servidor).
const gerencia = () => !!document.getElementById('conhecimento-enviar') || !!E?.bases?.areas?.length;
const ajuda={
 conversas:()=>['Retome suas conversas','Use a busca para encontrar uma conversa. Abra o menu de cada item para renomear ou excluir.','Excluir uma conversa remove também suas mensagens e anexos. Confira antes de confirmar a exclusão.',[
  ['Por quanto tempo as conversas ficam salvas?',`Conversas sem uso são excluídas após ${dias()} dias, conforme a configuração da empresa.`],
  ['Como filtrar a lista?','Quando a lista cresce, a tela mostra a busca e o filtro "Mostrar" (conversas livres, Quick Wins ou sigilosas).'],
  ['Como excluir todas?','Use "Excluir todas as conversas", no fim da lista. A exclusão vale só para as suas conversas neste ambiente e não pode ser desfeita.']]],
 c:()=>['Continue a conversa','Peça um ajuste, faça uma pergunta ou anexe outro material na caixa de mensagem. Use o menu "…" do título para renomear ou excluir a conversa.','Revise antes de usar: a IA pode errar. Dado bloqueado pela política não é enviado.',[
  ['Por quanto tempo a conversa fica salva?',`As conversas ficam salvas por até ${dias()} dias sem uso.`],
  ['O que é o "i" ao lado da resposta?','Mostra o nível usado na resposta e o motivo da escolha automática do nível.'],
  ['Como uso o Quick Win com outro material?','A caixa de mensagem continua o trabalho desta conversa. Para começar de novo com outro material, use "Usar com outro material", abaixo da caixa.'],
  ['O que muda com "Dados sigilosos"?','A conversa passa a usar só a IA aprovada para dados sigilosos e fica assim até ser apagada.']]],
 modelos:['Escolha os modelos disponíveis','Confira os modelos de cada nível e as regras da escolha automática do nível. As escolhas da equipe seguem os modelos liberados aqui.','Siga as recomendações da plataforma quando não precisar de uma configuração específica. As regras de sigilo continuam valendo.'],
 politicas:['Defina as regras de uso da IA','Confira quais dados podem ser enviados, quais precisam de proteção e quais devem ser bloqueados.','As regras valem para mensagens e anexos. Revise a política antes de disponibilizar para a equipe.'],
 configuracoes:['Configure o ambiente da empresa','Confira cada seção e salve apenas as configurações que precisar alterar.','Algumas mudanças afetam toda a equipe. Verifique o texto de ajuda de cada opção antes de salvar.'],
 conhecimento:()=>['Encontre uma fonte confiável',`A lista mostra os documentos permitidos para você. Use a busca e, se precisar, "Filtrar" para escolher base, pasta ou ordem.${gerencia()?' Em "Gerenciar bases" ficam os documentos que você administra.':''}`,'Quem administra pode definir responsável, validade e suspensão. Um documento suspenso ou vencido não entra em novas respostas.',[
  ['O que a IA pode consultar?','Só aparecem os conteúdos permitidos para o seu perfil. A IA usa trechos relevantes quando encontra fontes; não consulta necessariamente todos os documentos em cada resposta.'],
  ['Como este conteúdo é usado?','Os documentos disponíveis entram na busca das conversas e dos Quick Wins vinculados. Quando um conteúdo sigiloso é usado, a conversa é tratada como sigilosa segundo a política.'],
  ['Pastas mudam quem tem acesso?','Não. As pastas só organizam os arquivos. Quem faz parte de cada área é definido pelo admin da empresa, em Pessoas.'],
  ...(gerencia()?[
   ['Como enviar um documento?','Use "Enviar documento", escolha a base de destino e confira antes de confirmar: as pessoas dessa base poderão usar o conteúdo. Aceita PDF, Word, PowerPoint, Excel, texto ou imagem, até 25 MB. Imagem e PDF escaneado são lidos por OCR. Marcar como sigiloso não muda quem tem acesso à base.'],
   ['O que significa "Revisão recomendada"?',`O documento nunca foi revisado ou a última revisão passou de ${Number(E?.bases?.diasRevisao)||180} dias. "Marcar revisado" registra que você conferiu o conteúdo.`]]:[])]],
 qw:['Use um Quick Win (tarefa pronta)','Abra o Quick Win, envie o material e confira o resultado. Para usar com outro material, comece uma nova execução.','A conferência verifica regras configuradas. Ela não concede aprovação humana nem comprova que uma ação externa foi executada.'],
 integracoes:['Conecte apenas o que a tarefa precisa','Confira sistema, conta, permissões e efeitos antes de aprovar. Credenciais devem ser informadas somente no campo próprio.','Aprovar não executa. Qualquer escrita continua dependente de autorização e das regras da empresa.'],
 pendencias:()=>['Resolva uma coisa de cada vez','Comece pela primeira pendência: "Ver e resolver" abre a tela onde ela se resolve. Depois de resolver, use "Atualizar".','A lista só mostra o que seu perfil pode acompanhar. Ocorrências anteriores podem já ter sido tratadas.',[
  ['Como encontrar uma pendência?','Com várias pendências, use a busca e "Filtrar" para escolher o assunto. Os filtros podem ser salvos neste navegador.']]],
 'primeiros-passos':()=>['Aprenda no seu ritmo','Siga os passos com "Próximo passo" ou escolha um passo pelo nome. Você pode sair e voltar quando quiser.','O guia não envia arquivos nem executa tarefas.',[
  ['Como volto ao guia depois?','Use o botão Ajuda, no alto de qualquer tela, e escolha "Abrir o guia de primeiros passos".']]],
 preparacao:['Prepare o ambiente','Confira pessoas, recursos, política e fontes. As etapas mostram configurações atuais, não uma certificação.','Integrações são opcionais. Publicar um Quick Win exige conferir o teste da tarefa.'],
 atividade:['Entenda o registro','Filtre tipo, pessoa e período. Abra o detalhe para entender a alteração registrada.','A administração acompanha eventos e dados de uso; não recebe o conteúdo das conversas pessoais.'],
 pessoas:['Cuide de quem tem acesso','Abra uma pessoa para ver perfil, situação, áreas, grupos e a última revisão de acesso. As outras abas organizam áreas, grupos, perfis e quem cria Quick Wins.','Registrar a revisão não altera acesso. Mudar perfil ou desativar vale na hora para a pessoa.'],
 uso:['Acompanhe o consumo','Consumo realizado vem dos registros de uso. Previsão é uma estimativa para o restante do período.','Limites e regras do plano continuam sendo aplicados. Uma projeção não representa uma cobrança já realizada.'],
 default:()=>['Conte o que precisa e confira o resultado','Para uma tarefa pronta, escolha um Quick Win. Para um pedido diferente, explique o resultado esperado e envie o material necessário.','Nunca envie senhas ou chaves. A opção de dados sigilosos reforça a proteção e não contorna bloqueios.',[
  ['O que acontece com o que eu envio?','Revise antes de usar: a IA pode errar. Dado bloqueado pela política não é enviado.'],
  ['Por quanto tempo as conversas ficam salvas?',`Até ${dias()} dias sem uso, conforme a configuração da empresa.`]]]};
export function abrirAjuda(origem) {
 const h=location.hash.split(/[/?]/)[1],escolhida=ajuda[h==='quick-wins'?'qw':h]||ajuda.default,a=/\/acompanhamento(?:\/|\?|$)/.test(location.hash)?['Confira e acompanhe os registros','Execute o Quick Win e abra a conferência dos dados no resultado. Revise os campos e confirme para incluir no histórico. Os resultados do processo usam somente registros confirmados.','Cada registro começa só para você. Compartilhar libera os campos para quem tem acesso ao Quick Win, sem abrir a conversa. Apagar a conversa de origem também remove seus registros.'] : location.hash==='#/quick-wins/processos'?['Escolha um processo pronto','Os campos e indicadores já estão definidos. Escolha o processo e quem poderá usar. Teste o Quick Win antes de publicar para a equipe.','A criação não publica automaticamente. Integrações contínuas e painéis personalizados dependem de contratação específica.'] : typeof escolhida==='function'?escolhida():escolhida,host=document.getElementById('modal');if(host.querySelector('[role="dialog"]'))return;
 const perguntas=(a[3]||[]).length?`<div class="ajuda-perguntas">${a[3].map(([p,r])=>`<h3>${esc(p)}</h3><p>${esc(r)}</p>`).join('')}</div>`:'';
 host.innerHTML=`<div class="modal-fundo"><section class="modal ajuda-contextual" role="dialog" aria-modal="true" aria-labelledby="ajuda-titulo" tabindex="-1"><div class="modal-topo"><h2 id="ajuda-titulo">${esc(a[0])}</h2><button class="icone-btn" id="ajuda-fechar" aria-label="Fechar ajuda">×</button></div><p>${esc(a[1])}</p><div class="guia-cuidado"><b>Antes de continuar</b><p>${esc(a[2])}</p></div>${perguntas}<a class="btn btn-linha" href="#/primeiros-passos" id="ajuda-guia">Abrir o guia de primeiros passos</a><p class="dica">Esta ajuda usa orientações fixas aprovadas. Não consulta seus arquivos nem consome créditos de IA.</p>${window.temaGreenIA?window.temaGreenIA.seletorHtml('ajuda-tema','tema-ajuda'):''}</section></div>`;window.temaGreenIA?.ligarSeletor(host);
 const fechar=()=>{limpar();host.innerHTML='';origem?.focus();};const limpar=fecharComEscape(host.querySelector('.modal'),fechar);
 host.querySelector('#ajuda-fechar').onclick=fechar;host.querySelector('#ajuda-guia').onclick=fechar;host.querySelector('#ajuda-fechar').focus();
 const sair=()=>{if(host.querySelector('#ajuda-titulo')){limpar();host.innerHTML='';}document.removeEventListener('greenia:antes-navegar',sair);};document.addEventListener('greenia:antes-navegar',sair,{once:true});
}
