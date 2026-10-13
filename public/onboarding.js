// Preferência local por pessoa e empresa; nunca substitui ciência, permissão ou execução.
import { E, cabecalho, ligarCabecalho, pode } from '/app.js';
import { esc } from '/comum.js';
const memoria = new Map();
const chave = () => `greenia-guia-v1:${E.plataforma?.empresa?.id ?? 'local'}:${E.eu?.id}`;
function ler() {
  try { return JSON.parse(localStorage.getItem(chave()) || 'null') || memoria.get(chave()) || {}; }
  catch { return memoria.get(chave()) || {}; }
}
function gravar(v) { memoria.set(chave(), v); try { localStorage.setItem(chave(), JSON.stringify(v)); } catch {} }
// Guia concluído: a nova conversa deixa de sugerir o guia (ele continua na Ajuda).
export const guiaConcluido = () => !!ler().concluido;
function etapas() {
  const lista = [
    { titulo: 'Escolha o trabalho que precisa fazer', texto: 'Use um Quick Win para uma tarefa que já foi preparada pela empresa. Para um pedido diferente, abra uma conversa e conte o que precisa.', exemplo: 'Exemplo: “Resuma esta ata, liste as decisões e diga o que ainda falta definir.”', cuidado: 'Usar o Quick Win de novo, com outro material, começa um trabalho novo. Ajustes na conversa continuam o trabalho atual.', link: '#/quick-wins', acao: 'Explorar tarefas prontas', curto: 'Escolher' },
    { titulo: 'Dê o contexto e envie o material', texto: 'Explique para quem é o resultado, o que precisa receber e quais regras seguir. Use o clipe para anexar um arquivo ou o botão de link para adicionar uma página pública.', exemplo: 'Exemplo: “Prepare um resumo para a diretoria. Use apenas os números desta planilha.”', cuidado: 'Referência serve de modelo de estilo. O material traz os fatos deste trabalho. Uma página que exige login precisa de integração permitida pela empresa.', link: '#/nova', acao: 'Abrir uma conversa', curto: 'Enviar' },
    { titulo: 'Confira o resultado antes de usar', texto: 'Leia a resposta e confira números, nomes e fontes. A conferência do Quick Win verifica as regras configuradas, mas a IA ainda pode errar. Você pode pedir um ajuste na mesma conversa.', exemplo: 'Exemplo: “Mantenha os dados e reduza o texto para cinco tópicos.”', cuidado: 'Resposta conferida, autorização humana e ação executada são coisas diferentes. O painel de ações externas mostra o estado da execução; atualizar a autorização não executa nada.', link: '#/conversas', acao: 'Ver minhas conversas', curto: 'Conferir' },
    { titulo: 'Use o conhecimento e respeite as regras', texto: 'O Conhecimento reúne documentos disponíveis para você por área e para a empresa toda. A IA busca trechos relevantes e identifica os documentos usados quando encontra fontes.', exemplo: 'Você pode consultar uma política da empresa sem anexar o arquivo em todo novo pedido.', cuidado: 'Nunca envie senhas ou chaves de acesso. Dados e arquivos seguem a política da empresa. A opção de sigilo não permite ignorar uma regra de bloqueio.', link: '#/conhecimento', acao: 'Explorar o Conhecimento', curto: 'Conhecimento' },
  ];
  if (E.eu?.admin || E.bases?.areas?.length) lista.push({ titulo: 'Mantenha as bases confiáveis', texto: 'Em Conhecimento, abra Gerenciar bases para enviar documentos, organizar pastas e revisar conteúdos. Confira a área de destino antes de confirmar um envio: as pessoas dessa área poderão usar o conteúdo.', exemplo: 'Dê um título fácil de reconhecer e use pastas como Políticas, Manuais ou Procedimentos.', cuidado: 'Marcar revisado significa que você conferiu o conteúdo. Substituir um arquivo altera o que a IA consulta. Você só pode administrar as bases autorizadas para o seu perfil.', link: '#/conhecimento', acao: 'Abrir as bases', curto: 'Bases' });
  if (pode('policy.manage')) lista.push({ titulo: 'Prepare o ambiente para a equipe', texto: 'Antes de orientar o uso, confira as pessoas e áreas, os modelos liberados e as regras de dados. Explique à equipe quais tarefas já estão prontas e onde consultar a política.', exemplo: 'Comece com uma tarefa clara, confira o teste e publique a versão preparada para a equipe.', cuidado: 'Este guia não altera configurações nem libera acesso. As permissões e aprovações continuam sendo verificadas pelo servidor.', link: '#/politicas', acao: 'Consultar regras de uso', curto: 'Ambiente' });
  return lista;
}
export function vistaOnboarding() {
  const lista = etapas(); let passo = Math.min(Math.max(0, Number(ler().passo) || 0), lista.length - 1);
  const desenhar = () => {
    const e = lista[passo], fim = passo === lista.length - 1;
    document.getElementById('principal').innerHTML = `${cabecalho('Primeiros passos')}<div class="pagina"><div class="pagina-dentro"><div class="guia-pagina">
      <p class="lead">Aprenda no seu ritmo. O guia não envia arquivos nem executa tarefas.</p>
      ${ler().concluido ? '<p class="faixa-aviso ok" role="status">Guia concluído. Você pode rever qualquer etapa.</p>' : ''}
      <nav class="guia-etapas" aria-label="Etapas do guia">${lista.map((x, i) => `<button type="button" class="btn btn-linha btn-pequeno" data-guia-passo="${i}" ${i === passo ? 'aria-current="step"' : ''} title="${esc(x.titulo)}"><span class="guia-num" aria-hidden="true">${i + 1}</span>${esc(x.curto)}<span class="sr"> · ${esc(x.titulo)}</span></button>`).join('')}</nav>
      <article class="guia-cartao"><span class="dica">Passo ${passo + 1} de ${lista.length}</span><h2 tabindex="-1" id="guia-titulo">${esc(e.titulo)}</h2><p>${esc(e.texto)}</p><blockquote>${esc(e.exemplo)}</blockquote><div class="guia-cuidado"><b>Antes de continuar</b><p>${esc(e.cuidado)}</p></div><a class="btn btn-linha" href="${e.link}">${esc(e.acao)}</a></article>
      <div class="guia-rodape"><button type="button" class="btn btn-linha" id="guia-voltar" ${passo ? '' : 'disabled'}>Voltar</button><button type="button" class="btn btn-verde" id="guia-seguir">${fim ? 'Concluir guia' : 'Próximo passo'}</button></div>
      <p class="guia-saida"><a class="btn-texto" href="#/nova">Sair do guia</a><span class="dica">Para voltar ao guia depois, use o botão Ajuda, no alto da tela.</span></p></div></div></div>`;
    ligarCabecalho();
    const ir = n => { passo = n; gravar({ ...ler(), passo }); desenhar(); document.getElementById('guia-titulo').focus({ preventScroll: true }); };
    document.querySelectorAll('[data-guia-passo]').forEach(b => { b.onclick = () => ir(Number(b.dataset.guiaPasso)); });
    document.getElementById('guia-voltar').onclick = () => ir(Math.max(0, passo - 1));
    document.getElementById('guia-seguir').onclick = () => {
      if (!fim) return ir(passo + 1);
      gravar({ ...ler(), passo: 0, concluido: true }); location.hash = '#/nova';
    };
  };
  desenhar();
}
