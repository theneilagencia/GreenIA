// Detecção SOMENTE LEITURA de páginas de entrada e avisos de privacidade de empresas que ainda têm copy antiga.
// Abre só o banco da plataforma (tabelas companies, branding e landing_pages), em modo leitura, e não abre o banco
// de nenhuma empresa (conversas ficam lá). Não escreve nada. A saída tem só o id técnico da empresa, o status, o
// campo afetado, a origem do texto (padrão herdado da GreenIA ou texto próprio da empresa) e os ids de claim do
// registro (docs/claims-lp.md): nenhum texto da landing, nome, email ou mensagem.
//
// Uso (no servidor, na pasta do app):  node landings-antigas.js [caminho do banco da plataforma]
// Padrão: $BANCO_PLATAFORMA ou dados/plataforma.sqlite. Saída JSON com --json.
//
// DADOS embutidos (gerados do histórico do repositório em 2026-09-30): os modelos padrão de landing, marca e SEO de
// cada versão que chegou à produção (até 6534041), o modelo novo, os textos fora da página do registro e a blacklist
// editorial. Um campo igual a um modelo antigo é "padrão herdado"; diferente de todos, é "texto da empresa".
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const DADOS = {"gerado":"2026-09-30","atual":{"landing":["A IA da {{empresa}}","IA para o trabalho, com as regras da casa","Resuma, confira, rascunhe e consulte os documentos da sua área num lugar só. As regras de dados da {{empresa}} são aplicadas a cada mensagem e anexo antes do envio.","Entrar com o email da empresa","primario","Como usar","secundario","Código de acesso no email","Sem senha para decorar","Suas conversas não aparecem nas telas de colegas e do admin","Como usar","Três passos para começar","Ao entrar","O que você encontra","Antes de enviar","O que pode, o que pede cuidado e o que é bloqueado","A GreenIA confere cada mensagem e cada anexo antes do envio, pelas regras que a {{empresa}} definiu para os tipos de dado reconhecidos.","Boas tarefas","Por onde começar","Exemplos de pedidos para começar.","Pronto para começar","Revise sempre antes de usar. A IA ajuda, a decisão é sua.","Entrar","Entre com o seu email","Use o email da {{empresa}}. Um código de 6 dígitos, de uso único, chega por email.","Peça em palavras simples","Cole um texto, anexe PDF, Word, Excel, PowerPoint, CSV ou imagem e diga o que precisa. Imagens e PDFs escaneados viram texto no servidor da GreenIA, e esse texto segue para a IA.","Revise e ajuste","Peça mais curto, em tabela ou em outro tom. A decisão final é sempre sua.","Conversas","Para qualquer tarefa do dia: resumir, conferir, reescrever, organizar. A conversa fica salva e dá para continuar depois, dentro do prazo de retenção da empresa.","Quick wins","Usos prontos para tarefas que se repetem na sua área, com instruções já definidas. Você traz só o caso do dia. Nos quick wins criados pela jornada guiada, o resultado é conferido contra as regras antes de aparecer.","Conhecimento","Procedimentos e documentos das áreas. Quando a busca encontra documentos da área, a resposta lista os documentos consultados.","Classes de modelo","A GreenIA escolhe o nível de cada pedido entre Rápido, Equilibrado e Avançado, dentro do que a empresa libera. Nas conversas, cada resposta explica por que aquele nível foi usado. Se preferir, você escolhe.","Textos e documentos de trabalho","Procedimentos, modelos e rascunhos","Planilhas sem dados pessoais","Dados de clientes, fornecedores e pessoas","Informações financeiras ou estratégicas","Com a opção de informações sigilosas ligada pela empresa, a conversa só usa recursos autorizados; se não houver, nada é enviado","Senhas, tokens e chaves de acesso reconhecidos","Inclusive em documentos da base e no histórico","Nenhuma regra da empresa libera","Resumir","Resuma este relatório em cinco pontos para a diretoria","Conferir","Compare estes dois contratos e liste o que mudou","Consultar","Qual é o prazo do procedimento de recebimento?","Organizar","Monte uma tabela com estas três cotações","Rascunhar","Escreva um email ao fornecedor sobre a divergência","Revisar","Deixe este texto mais claro e mais curto","A IA na {{empresa}}","A {{empresa}} oferece a GreenIA para apoiar o trabalho do dia a dia, com as regras de dados da empresa e a Política de Uso de IA. As conversas ficam guardadas no banco da empresa; para responder, o conteúdo segue para o recurso de IA. Em caso de dúvida, fale com a equipe responsável pela IA na {{empresa}}.","Política de uso de IA"],"marca":["Entre com o seu email de trabalho","Esta é a IA de uso interno de {{empresa}}. Você recebe um código de acesso de 6 dígitos no email, sem senha para decorar.","Nenhuma tela da GreenIA mostra o conteúdo das suas conversas a colegas ou ao admin; ele fica no banco da empresa, e você pode apagar as conversas quando quiser. As regras de dados da empresa são aplicadas a cada mensagem e anexo antes do envio à IA."],"seo":["{{empresa}} · IA para o trabalho","Ambiente de IA da {{empresa}}: conversas, quick wins e conhecimento das áreas, com as regras de dados da empresa."]},"antigos":{"landing":["A IA da {{empresa}}","IA para o trabalho, com as regras da casa","Resuma, confira, rascunhe e consulte os documentos da sua área num lugar só. As regras de dados da {{empresa}} são aplicadas antes de cada envio.","Entrar com o email da empresa","primario","Como usar","secundario","Código de acesso no email","Sem senha para decorar","Conversas salvas só para você","Três passos para começar","Ao entrar","O que você encontra","Antes de enviar","O que pode, o que pede cuidado e o que nunca sai","A GreenIA confere cada mensagem e cada anexo antes do envio, pelas regras que a {{empresa}} definiu.","Boas tarefas","Por onde começar","Pedidos que costumam dar bom resultado logo na primeira semana.","Pronto para começar","Revise sempre antes de usar. A IA ajuda, a decisão é sua.","Entrar","Entre com o seu email","Use o email da {{empresa}}. Um código de 6 dígitos chega na hora.","Peça em palavras simples","Cole um texto, anexe PDF, Word, Excel ou CSV e diga o que precisa.","Revise e ajuste","Peça mais curto, em tabela ou em outro tom. A decisão final é sempre sua.","Conversas","Para qualquer tarefa do dia: resumir, conferir, reescrever, organizar. A conversa fica salva e dá para continuar depois.","Quick wins","Usos prontos para tarefas que se repetem na sua área, com instruções e arquivos já definidos. Você traz só o caso do dia.","Conhecimento","Procedimentos e documentos das áreas. A resposta mostra de qual documento veio a informação.","Classes de modelo","Você escolhe o tipo de trabalho, não o modelo técnico: Rápido para o dia a dia, Equilibrado para mais contexto, Avançado para análises longas.","Textos e documentos de trabalho","Procedimentos, modelos e rascunhos","Planilhas sem dados pessoais","Dados de clientes, fornecedores e pessoas","Informações financeiras ou estratégicas","A conversa vai só para modelos homologados pela empresa, sem retenção","Senhas, tokens e chaves de acesso","Credenciais de sistemas","A GreenIA bloqueia antes do envio","Resumir","Resuma este relatório em cinco pontos para a diretoria","Conferir","Compare estes dois contratos e liste o que mudou","Consultar","Qual é o prazo do procedimento de recebimento?","Organizar","Monte uma tabela com estas três cotações","Rascunhar","Escreva um email ao fornecedor sobre a divergência","Revisar","Deixe este texto mais claro e mais curto","A IA na {{empresa}}","A {{empresa}} oferece a GreenIA para apoiar o trabalho do dia a dia com segurança. Os dados ficam no ambiente da empresa e seguem a Política de Uso de IA. Em caso de dúvida, fale com a equipe responsável pela IA na {{empresa}}.","Política de uso de IA","Usos prontos para tarefas que se repetem na sua área, com instruções e arquivos já definidos.","Você escolhe o tipo de trabalho, não o modelo técnico: Rápido, Equilibrado ou Avançado."],"marca":["Entre com o seu email de trabalho","Esta é a IA de uso interno de {{empresa}}. Você recebe um código de acesso de 6 dígitos no email, sem senha para decorar.","Suas conversas ficam salvas só para você e podem ser apagadas quando quiser. As regras de dados da empresa são conferidas antes de cada envio à IA.","Suas conversas ficam salvas só para você, por até 90 dias sem uso, e você pode apagá-las quando quiser."],"seo":["{{empresa}} · IA para o trabalho","Ambiente de IA da {{empresa}}: conversas, quick wins e conhecimento das áreas, com as regras de dados da empresa."]},"registro":[["OUT-01","Credenciais nunca são enviadas"],["OUT-02","Nunca enviadas"],["OUT-03","o que nunca sai"],["OUT-04","Conversas salvas só para você"],["OUT-05","por até 90 dias sem uso"],["OUT-06","Ambiente exclusivo"],["OUT-07","créditos previsíveis"],["OUT-08","Descubra onde a IA realmente funciona"],["OUT-09","amplia só o que dá resultado"],["OUT-10","costumam dar bom resultado logo na primeira semana"],["OUT-11","Você escolhe o tipo de trabalho"],["OUT-12","Equilibrado para mais contexto"],["OUT-13","Modelos de vários fabricantes"],["OUT-14","chega na hora"],["OUT-15","com endereço próprio."],["OUT-16","sem retenção"],["OUT-17","sobrescritos no arquivo"],["OUT-18","expiram em até 7 dias"],["OUT-19","não aparece para colegas nem para o admin"],["OUT-20","Colegas e admin não veem"],["OUT-21","pedem mais capacidade"],["OUT-22","provar os primeiros quick wins"],["OUT-23","fica sempre ligada"],["OUT-24","recebe o próprio ambiente da GreenIA"],["OUT-25","o texto extraído segue as mesmas regras de mensagem e anexo"],["OUT-26","também pode acessar o ambiente quando necessário"],["OUT-27","ficam salvos só para você"],["OUT-28","leem o conteúdo das conversas"],["OUT-29","nunca são enviados à IA"],["OUT-30","aplica a proteção quando ela é necessária"],["OUT-31","garantem não usar os dados para treino"],["FUT-01","comparação de antes e depois"],["FUT-02","Medido, com decisão registrada"],["FUT-03","Decidir e ampliar"],["FUT-04","Fonte citada"],["FUT-05","A resposta mostra de qual documento veio a informação"],["FUT-06","Registre o antes e o depois de cada quick win"],["FUT-07","Cada referência abre o trecho enviado"],["FUT-08","O consumo mensal nunca passa do teto"],["FUT-09","Regras de dados verificadas em tudo o que vai para a IA"],["FUT-10","Entre com passkey"]],"blacklist":[["B01","nunca\\s+(?:são\\s+)?enviad|credenciais[^.]{0,40}\\bnunca\\b"],["B02","nunca\\s+sa(?:i|em)\\b|não\\s+sa(?:i|em)\\s+da\\s+empresa|dados\\s+ficam\\s+(?:no\\s+ambiente|na\\s+empresa|dentro)"],["B03","só\\s+para\\s+você|somente\\s+para\\s+você|100\\s*%\\s*privad|totalmente\\s+privad|privacidade\\s+total"],["B04","resultados?\\s+corret|respostas?\\s+corret|resposta\\s+validada|sem\\s+erros|sem\\s+alucina"],["B05","fonte\\s+citada|cita\\s+a\\s+fonte|mostra\\s+de\\s+qual\\s+documento\\s+veio"],["B06","exclusiv|infraestrutura\\s+(?:dedicada|privada)|servidor(?:es)?\\s+dedicad|fisicamente\\s+isolad"],["B07","(?:não|nunca)\\s+(?:são|é)\\s+usad[oa]s?\\s+para\\s+trein|sem\\s+treino\\s+garantid|garant\\w*[^.]{0,30}trein"],["B08","previsíve|custo\\s+garantid|gasto\\s+garantid|limite\\s+rígido|nunca\\s+passa\\s+do\\s+teto|nunca\\s+ultrapass"],["B09","antes\\s+e\\s+depois|mede[^.]{0,30}resultado|resultado\\s+medido"],["B10","amplia\\w*\\s+só|decidid\\w*\\s+com\\s+dados|decisão\\s+registrada|greenia\\s+decide"],["B11","(?:dados|servidores?)\\s+no\\s+brasil|residência[^.]{0,20}brasil"],["B12","\\b(?:garante|garantem|garantimos|assegura|asseguramos|elimina)\\b"],["B13","sem\\s+risco|risco\\s+zero"],["B14","o\\s+melhor\\s+modelo"],["B15","ilimitad|sem\\s+limite\\s+de\\s+(?:pessoas|usuários)|pessoas\\s+sem\\s+limite"],["B16","na\\s+hora\\b|instantâne"],["B17","primeira\\s+semana|costumam\\s+dar\\s+bom\\s+resultado"],["B18","mais\\s+contexto"],["B19","você\\s+escolhe\\s+o\\s+tipo"],["B21","\\bnunca\\b"],["B22","\\bsempre\\b"],["B25","cópias?\\s+de\\s+segurança[^.]{0,60}\\d+\\s*dias|backups?[^.]{0,40}\\d+\\s*dias"],["B26","\\bprovar\\b|comprovad|\\bROI\\b|retorno\\s+sobre\\s+o\\s+investimento"],["B27","sobrescrit"]]};

const ESCAPE = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = s => String(s).replace(/\s+/g, ' ').trim();
const PADROES = [
  ...DADOS.registro.map(([id, texto]) => [id, new RegExp(ESCAPE(norm(texto)), 'i')]),
  ...DADOS.blacklist.map(([id, fonte]) => [id, new RegExp(fonte, 'i')]),
];
// Contextuais (mesma regra de test/claims-lp.test.js).
const CONTEXTUAIS = [
  ['B20', f => /antes\s+(?:de\s+cada|do)\s+envio/i.test(f) && !/mensage[mn]|anexo|senhas?|chaves? de acesso|documentos da base|dados são reconhecidos/i.test(f)],
  ['B23', f => /\b(?:colegas|admin)\b/i.test(f) && /não\s+(?:veem|vê|aparecem?|mostra)|nenhuma\s+tela/i.test(f) && !/\btelas?\b/i.test(f)],
  ['B24', f => /conferid[oa]s?\s+a\s+cada\s+execução/i.test(f) && !/guiad/i.test(f)],
];

// Folhas de texto de um objeto (landing), com o caminho do campo; imagens, links e liga/desliga de seção ficam fora.
function folhas(o, p = '', out = []) {
  if (typeof o === 'string') { if (!/^(?:data:|https?:|\/)/.test(o) && o.trim()) out.push([p, o]); }
  else if (Array.isArray(o)) o.forEach((x, i) => folhas(x, `${p}[${i}]`, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!['imagem', 'link', 'secoes'].includes(k)) folhas(v, p ? `${p}.${k}` : k, out);
  return out;
}
const campoGenerico = p => p.replace(/\[\d+\]/g, '[]');

// O que o texto de um campo tem de antigo, e de onde ele veio. Texto igual ao modelo novo está aprovado.
function classificar(valor, nomes, modeloAtual, modelosAntigos) {
  let v = norm(valor);
  for (const n of nomes.filter(Boolean).sort((a, b) => b.length - a.length)) v = v.split(n).join('{{empresa}}');
  if (modeloAtual.has(v)) return null;
  const claims = [...new Set([...PADROES.filter(([, re]) => re.test(valor)).map(([id]) => id),
    ...CONTEXTUAIS.filter(([, f]) => valor.split(/(?<=[.!?])\s+/).some(f)).map(([id]) => id)])].sort();
  if (!claims.length) return null;
  return { origem: modelosAntigos.has(v) ? 'padrao_herdado' : 'texto_da_empresa', claims };
}

export function detectarLandings(db) {
  const atual = { landing: new Set(DADOS.atual.landing.map(norm)), marca: new Set(DADOS.atual.marca.map(norm)), seo: new Set(DADOS.atual.seo.map(norm)) };
  const antigos = { landing: new Set(DADOS.antigos.landing.map(norm)), marca: new Set(DADOS.antigos.marca.map(norm)), seo: new Set(DADOS.antigos.seo.map(norm)) };
  const empresas = db.prepare(`select c.id, c.status, c.name, b.display_name, b.privacy_note, b.login_title, b.login_text, l.content, l.seo
    from companies c left join branding b on b.company_id = c.id left join landing_pages l on l.company_id = c.id order by c.created_at, c.id`).all();
  const resultado = [];
  for (const e of empresas) {
    const nomes = [e.name, e.display_name];
    const achados = [];
    const conferir = (grupo, campo, valor) => { const r = classificar(valor, nomes, atual[grupo], antigos[grupo]); if (r) achados.push({ grupo, campo, ...r }); };
    let content = null; try { content = e.content ? JSON.parse(e.content) : null; } catch { achados.push({ grupo: 'landing', campo: '(ilegível)', origem: 'desconhecida', claims: [] }); }
    if (content) for (const [p, v] of folhas(content)) conferir('landing', campoGenerico(p), v);
    let seo = null; try { seo = e.seo ? JSON.parse(e.seo) : null; } catch { /* sem SEO legível: nada a conferir */ }
    if (seo) for (const [p, v] of folhas(seo)) conferir('seo', p, v);
    for (const k of ['privacy_note', 'login_title', 'login_text']) if (e[k]) conferir('marca', k, e[k]);
    resultado.push({ empresa: e.id, status: e.status, temLanding: !!content, achados });
  }
  const com = resultado.filter(r => r.achados.length);
  return {
    empresas: resultado.length, comLanding: resultado.filter(r => r.temLanding).length, comClaimAntigo: com.length,
    avisoDesatualizado: resultado.filter(r => r.achados.some(a => a.campo === 'privacy_note')).length,
    comTextoDaEmpresa: resultado.filter(r => r.achados.some(a => a.origem === 'texto_da_empresa')).length,
    porEmpresa: com.map(r => ({ empresa: r.empresa, status: r.status, achados: r.achados })),
  };
}

function imprimir(r) {
  console.log(`Empresas: ${r.empresas} · com landing salva: ${r.comLanding} · com claim antigo: ${r.comClaimAntigo} · aviso de privacidade desatualizado: ${r.avisoDesatualizado} · com texto próprio da empresa afetado: ${r.comTextoDaEmpresa}`);
  for (const e of r.porEmpresa) {
    console.log(`\nEmpresa técnica ${e.empresa} (${e.status}):`);
    for (const a of e.achados) console.log(`  - ${a.grupo}.${a.campo} [${a.origem === 'padrao_herdado' ? 'padrão herdado' : a.origem === 'texto_da_empresa' ? 'texto da empresa' : a.origem}]: ${a.claims.join(', ') || '—'}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const caminho = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.BANCO_PLATAFORMA || 'dados/plataforma.sqlite';
  const db = new DatabaseSync(caminho, { readOnly: true });
  try { const r = detectarLandings(db); if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2)); else imprimir(r); } finally { db.close(); }
}
