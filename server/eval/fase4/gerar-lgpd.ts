// Evidências de LGPD fictícias para o assistente de organização de evidências
// (frente LGPD): políticas e normas, atas do comitê de privacidade, listas de
// presença e certificados de treinamento, contratos com operadores, relatórios
// de incidente, inventários de dados (ROPA) e planilhas sem relação com LGPD,
// em PDF, DOCX e XLSX. Cerca de 60 documentos, em casos de 10 (uma execução por
// caso). O gabarito traz a categoria da taxonomia do modelo, o período (AAAA-MM)
// e o nome padronizado ({categoria}/{periodo}_{nome}) de cada documento, e as
// perguntas de busca (20 no total) com os documentos esperados.
// DOC (Word 97) fica de fora: gerar exige o LibreOffice para escrever; a leitura
// de DOC pela plataforma (conversão) é medida com arquivos reais, se vierem.
//   node --experimental-strip-types eval/fase4/gerar-lgpd.ts --saida eval/fase4/saida --casos 6 --semente 4303
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARCA, args, docx, gravar, gravarJson, pdf, pessoa, rng, xlsx, type Rng } from './lib.ts';
import { dataBr, mesPorExtenso, semAcento, ultimoDia } from './lib-extra.ts';

// Taxonomia do modelo organizacao-evidencias (versão 1 do catálogo).
export const CATEGORIAS = ['politicas', 'treinamentos', 'contratos', 'incidentes', 'registros'] as const;
export type Categoria = typeof CATEGORIAS[number];
// Nomes e sinônimos da taxonomia: documento sem relação não pode ter nenhum.
export const TERMOS_TAXONOMIA = ['Políticas e normas', 'política de privacidade', 'norma interna', 'política de segurança', 'Treinamentos', 'lista de presença', 'certificado de conclusão',
  'Contratos com operadores', 'acordo de processamento de dados', 'DPA', 'cláusulas de proteção de dados', 'Incidentes', 'relatório de incidente', 'comunicação à ANPD',
  'Registro de operações', 'inventário de dados', 'ROPA', 'registro das operações de tratamento'];
export const PADRAO_NOME = '{categoria}/{periodo}_{nome}';
export const DOCUMENTOS_POR_CASO = 10;
export const PERGUNTAS_TOTAL = 20;

// Nome padronizado pela regra do modelo; nome é o nome do arquivo sem extensão, em minúsculas e com hífens.
export const slug = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'documento';
export function nomePadrao(categoria: Categoria, periodo: string, arquivo: string): string {
  const ext = (arquivo.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
  return PADRAO_NOME.replace('{categoria}', categoria).replace('{periodo}', periodo).replace('{nome}', slug(arquivo.replace(/\.[^.]+$/, ''))) + ext;
}

type Formato = 'pdf' | 'docx' | 'xlsx';
interface Doc { base: string; formato: Formato; categoria: Categoria | null; periodo: string | null; titulo: string; paragrafos: string[]; tabela?: (string | number | null)[][]; pergunta?: string; grupo?: string }

const pad = (n: number) => String(n).padStart(2, '0');
const OPERADORES = ['Nuvem Exemplo Serviços de TI Ltda.', 'Folha Fictícia Processamento Ltda.', 'Marketing Modelo Digital Ltda.', 'Call Center Teste S.A.', 'Contabilidade Exemplo Associados', 'Transportes Fictícios de Documentos Ltda.', 'Laboratório Modelo de Exames Ltda.', 'Backup Teste Armazenamento Ltda.', 'Assinatura Eletrônica Exemplo Ltda.', 'Benefícios Fictícios Administradora Ltda.'];
const AREAS = ['Recursos Humanos', 'Comercial', 'Financeiro', 'Atendimento ao cliente', 'Tecnologia', 'Jurídico'];
const TEMAS = ['LGPD para lideranças', 'Proteção de dados no atendimento', 'Segurança da informação para novos colaboradores', 'Resposta a incidentes com dados pessoais', 'Direitos dos titulares', 'Classificação da informação'];
const INCIDENTES = ['envio de planilha de clientes a destinatário errado', 'perda de notebook com arquivos de RH', 'acesso indevido a pasta compartilhada do financeiro', 'mensagem de phishing com credencial comprometida', 'impressão de ficha cadastral esquecida na recepção', 'backup exposto por configuração incorreta'];

function data(r: Rng): { iso: string; mes: string } {
  const mes = `${r.pick([2025, 2026, 2026])}-${pad(r.int(1, 12))}`;
  const m = mes > '2026-08' ? `2026-${pad(r.int(1, 8))}` : mes;
  return { iso: `${m}-${pad(r.int(1, ultimoDia(m)))}`, mes: m };
}

// Geradores por tipo. Cada documento tem um período claro no início (data do
// próprio documento) e os termos da categoria no título, salvo onde marcado.
const TIPOS: Record<string, (r: Rng, n: number) => Doc> = {
  politica: (r, n) => {
    const d = data(r);
    const t = r.pick([['Política de Privacidade', 'politica-de-privacidade'], ['Política de Segurança da Informação', 'politica-de-seguranca-da-informacao'], ['Norma Interna de Retenção e Descarte de Dados', 'norma-interna-retencao'], ['Norma Interna de Controle de Acesso', 'norma-interna-controle-de-acesso'], ['Política de Privacidade dos Colaboradores', 'politica-privacidade-colaboradores']]);
    const v = r.int(1, 6);
    return { base: n % 5 === 4 ? `documento-aprovado-${String(n).padStart(3, '0')}` : `${t[1]}-v${v}`, formato: r.pick(['pdf', 'docx']), categoria: 'politicas', periodo: d.mes, titulo: t[0].toUpperCase(),
      paragrafos: [`Versão ${v}, aprovada em ${dataBr(d.iso)} pela diretoria.`, `Esta ${t[0].toLowerCase()} descreve como a Empresa Demonstração S.A. trata dados pessoais de clientes, colaboradores e fornecedores.`,
        'Aplica-se a todas as áreas, unidades e prestadores que tenham acesso a dados pessoais.', 'O encarregado pelo tratamento de dados pessoais pode ser contatado pelo canal indicado no site.',
        'Os dados são tratados apenas para finalidades legítimas, específicas e informadas ao titular.', 'O descumprimento desta norma sujeita o responsável às medidas disciplinares cabíveis.'],
      pergunta: `Onde está a ${t[0].toLowerCase()} versão ${v}, aprovada em ${mesPorExtenso(d.mes)}?`, grupo: 'politicas' };
  },
  presenca: (r, n) => {
    const d = data(r); const tema = r.pick(TEMAS);
    const nomes = Array.from({ length: r.int(8, 18) }, () => pessoa(r).nome);
    const formato: Formato = r.pick(['pdf', 'xlsx']);
    return { base: n % 4 === 3 ? `scan-${String(n * 7).padStart(4, '0')}` : `lista-presenca-${slug(tema).split('-').slice(0, 3).join('-')}-${d.mes}`, formato, categoria: 'treinamentos', periodo: d.mes, titulo: 'LISTA DE PRESENÇA',
      paragrafos: [`Treinamento: ${tema}`, `Data: ${dataBr(d.iso)} · Carga horária: ${r.int(1, 4)} h · Modalidade: ${r.pick(['presencial', 'on-line'])}`, 'Participantes:', ...nomes.map((x, j) => `${j + 1}. ${x} · assinatura: ____________`)],
      tabela: [['LISTA DE PRESENÇA'], [`Treinamento: ${tema}`], [`Data: ${dataBr(d.iso)}`], ['Nº', 'Nome', 'Área', 'Assinatura'], ...nomes.map((x, j) => [j + 1, x, r.pick(AREAS), 'assinado'])],
      pergunta: `Qual documento comprova a presença no treinamento "${tema}" de ${dataBr(d.iso)}?`, grupo: 'treinamentos' };
  },
  certificado: (r, n) => {
    const d = data(r); const p = pessoa(r); const tema = r.pick(TEMAS);
    return { base: `certificado-${slug(p.nome.split(' ')[0])}-${n}`, formato: 'pdf', categoria: 'treinamentos', periodo: d.mes, titulo: 'CERTIFICADO DE CONCLUSÃO',
      paragrafos: [`Certificamos que ${p.nome} concluiu o curso "${tema}" em ${dataBr(d.iso)}, com carga horária de ${r.int(2, 8)} horas.`, 'Curso interno oferecido pela Empresa Demonstração S.A.'],
      pergunta: `Onde está o certificado de conclusão de ${p.nome}?`, grupo: 'treinamentos' };
  },
  contrato: (r, n) => {
    const d = data(r); const op = OPERADORES[n % OPERADORES.length];
    const dpa = r.next() < 0.6;
    const titulo = dpa ? 'ACORDO DE PROCESSAMENTO DE DADOS' : 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS · CLÁUSULAS DE PROTEÇÃO DE DADOS';
    return { base: n % 5 === 2 ? `contrato-${slug(op).split('-').slice(0, 2).join('-')}-assinado` : `${dpa ? 'dpa' : 'contrato-servicos'}-${slug(op).split('-').slice(0, 2).join('-')}`, formato: r.pick(['docx', 'pdf']), categoria: 'contratos', periodo: d.mes, titulo,
      paragrafos: [`Assinado em ${dataBr(d.iso)} entre a Empresa Demonstração S.A. (controladora) e ${op} (operadora).`, 'Objeto: tratamento de dados pessoais por conta e ordem da controladora, nos limites deste instrumento.',
        'A operadora tratará os dados apenas conforme as instruções documentadas da controladora.', 'A operadora adotará medidas de segurança técnicas e administrativas aptas a proteger os dados pessoais.',
        'Ao término, os dados serão devolvidos ou eliminados, salvo obrigação legal de guarda.', 'A suboperação depende de autorização prévia e por escrito.'],
      pergunta: `Onde está o contrato com ${op} que trata da proteção de dados?`, grupo: 'contratos' };
  },
  incidente: (r, n) => {
    const d = data(r); const o = INCIDENTES[n % INCIDENTES.length]; const num = `RI-${d.mes.slice(0, 4)}-${String(r.int(1, 40)).padStart(3, '0')}`;
    return { base: n % 3 === 1 ? `ocorrencia-${slug(num)}` : `relatorio-incidente-${slug(num)}`, formato: r.pick(['pdf', 'docx']), categoria: 'incidentes', periodo: d.mes, titulo: `RELATÓRIO DE INCIDENTE Nº ${num}`,
      paragrafos: [`Data da ocorrência: ${dataBr(d.iso)}.`, `Descrição: ${o}.`, `Dados afetados: ${r.pick(['nome e e-mail de clientes', 'dados cadastrais de colaboradores', 'dados bancários de fornecedores'])}. Titulares afetados: cerca de ${r.int(3, 400)}.`,
        'Contenção: acesso revogado e arquivos recolhidos no mesmo dia.', `Avaliação de risco: ${r.pick(['baixo', 'médio'])}. Comunicação à autoridade: ${r.pick(['não necessária', 'feita no prazo'])}.`],
      pergunta: `Qual relatório trata do incidente de ${mesPorExtenso(d.mes)} (${o})?`, grupo: 'incidentes' };
  },
  anpd: (r, n) => {
    const d = data(r); const o = INCIDENTES[(n + 2) % INCIDENTES.length];
    return { base: `comunicacao-anpd-${d.mes}`, formato: 'pdf', categoria: 'incidentes', periodo: d.mes, titulo: 'COMUNICAÇÃO À ANPD · INCIDENTE DE SEGURANÇA',
      paragrafos: [`Comunicação enviada em ${dataBr(d.iso)} à Autoridade Nacional de Proteção de Dados.`, `Natureza do incidente: ${o}.`, 'Medidas adotadas: contenção, análise de causa e comunicação aos titulares.', 'Protocolo de envio: fictício, sem validade.'],
      pergunta: `Onde está a comunicação à ANPD enviada em ${dataBr(d.iso)}?`, grupo: 'incidentes' };
  },
  ata: (r, n) => {
    const d = data(r);
    const [cat, pauta] = r.pick([['politicas', 'aprovação da política de segurança da informação revisada'], ['politicas', 'revisão da norma interna de retenção de dados'], ['incidentes', 'análise do relatório de incidente do mês e do plano de ação'], ['registros', 'revisão do inventário de dados das áreas']] as const);
    return { base: `ata-comite-privacidade-${d.mes}-${n}`, formato: r.pick(['docx', 'pdf']), categoria: cat, periodo: d.mes, titulo: 'ATA DE REUNIÃO DO COMITÊ DE PRIVACIDADE',
      paragrafos: [`Data: ${dataBr(d.iso)}. Pauta: ${pauta}.`, `Presentes: ${Array.from({ length: 4 }, () => pessoa(r).nome).join(', ')}.`, 'Deliberações: o comitê aprovou os encaminhamentos propostos e definiu responsáveis e prazos.', 'Nada mais havendo a tratar, a reunião foi encerrada e esta ata lavrada.'],
      pergunta: `Em qual ata do comitê de privacidade, de ${mesPorExtenso(d.mes)}, a pauta foi a ${pauta}?`, grupo: cat };
  },
  ropa: (r, n) => {
    const d = data(r); const area = AREAS[n % AREAS.length];
    const formato: Formato = r.pick(['xlsx', 'xlsx', 'docx']);
    const linhas = [['Cadastro de clientes', 'nome, CPF, e-mail', 'execução de contrato', '5 anos'], ['Folha de pagamento', 'nome, CPF, dados bancários', 'obrigação legal', '10 anos'], ['Envio de ofertas', 'nome, e-mail', 'consentimento', 'até a revogação'], ['Controle de acesso', 'nome, foto', 'legítimo interesse', '6 meses']];
    return { base: `inventario-de-dados-${slug(area)}-${d.mes}`, formato, categoria: 'registros', periodo: d.mes, titulo: `INVENTÁRIO DE DADOS PESSOAIS (ROPA) · ${area.toUpperCase()}`,
      paragrafos: [`Referência: ${d.mes.slice(5, 7)}/${d.mes.slice(0, 4)}. Área: ${area}.`, ...linhas.map(l => l.join(' · '))],
      tabela: [[`Inventário de dados pessoais (ROPA) · ${area}`], [`Referência: ${d.mes.slice(5, 7)}/${d.mes.slice(0, 4)}`], ['Processo', 'Dados pessoais', 'Base legal', 'Retenção'], ...linhas],
      pergunta: `Onde está o inventário de dados da área ${area}?`, grupo: 'registros' };
  },
  semRelacao: (r, n) => {
    const opcoes: [string, string, (string | number | null)[][]][] = [
      ['controle-chaves', 'Controle de chaves das salas', [['Sala', 'Responsável', 'Cópias'], ['Arquivo', 'Portaria', 2], ['Almoxarifado', 'Manutenção', 1], ['Sala de reuniões', 'Recepção', 3]]],
      ['estoque-material-escritorio', 'Estoque de material de escritório', [['Item', 'Quantidade', 'Mínimo'], ['Papel A4 (resma)', 42, 20], ['Caneta azul', 130, 50], ['Grampeador', 6, 2]]],
      ['cardapio-refeitorio', 'Cardápio do refeitório', [['Dia', 'Prato principal', 'Sobremesa'], ['Segunda', 'Frango grelhado', 'Fruta'], ['Terça', 'Feijoada', 'Pudim'], ['Quarta', 'Peixe assado', 'Gelatina']]],
      ['ramais-internos', 'Ramais internos', [['Setor', 'Ramal'], ['Recepção', 2001], ['Compras', 2045], ['Manutenção', 2090]]],
      ['vagas-estacionamento', 'Vagas do estacionamento', [['Vaga', 'Placa', 'Setor'], ['A1', 'ABC1D23', 'Diretoria'], ['A2', 'EFG4H56', 'Comercial'], ['B7', 'IJK7L89', 'Visitantes']]],
      ['mesas-e-cadeiras', 'Patrimônio: mesas e cadeiras', [['Plaqueta', 'Descrição', 'Local'], ['0012', 'Mesa em L', 'Sala 3'], ['0013', 'Cadeira giratória', 'Sala 3'], ['0020', 'Armário de aço', 'Arquivo']]],
    ];
    const [base, titulo, tabela] = opcoes[n % opcoes.length];
    const comunicado = n % 7 === 6;
    return comunicado
      ? { base: 'comunicado-campanha-agasalho', formato: 'docx', categoria: null, periodo: null, titulo: 'COMUNICADO INTERNO', paragrafos: ['Campanha do agasalho: as doações podem ser deixadas na recepção.', 'Agradecemos a participação de todos.'] }
      : { base, formato: 'xlsx', categoria: null, periodo: null, titulo, paragrafos: [], tabela: [[titulo], ...tabela] };
  },
};

// Sequência de 60 documentos (proporções do plano); para mais ou menos casos, ela se repete.
const SEQUENCIA: string[] = [
  ...Array(9).fill('politica'), ...Array(7).fill('presenca'), ...Array(3).fill('certificado'), ...Array(9).fill('contrato'), ...Array(6).fill('incidente'),
  ...Array(2).fill('anpd'), ...Array(8).fill('ata'), ...Array(6).fill('ropa'), ...Array(10).fill('semRelacao'),
];

async function bytesDe(d: Doc): Promise<Uint8Array> {
  if (d.formato === 'pdf') return pdf([[{ titulo: d.titulo, linhas: d.paragrafos }]]);
  if (d.formato === 'docx') return docx(d.titulo, d.paragrafos);
  return xlsx({ [d.titulo.slice(0, 28).replace(/[\\/?*[\]:]/g, ' ')]: [...(d.tabela ?? [[d.titulo], ...d.paragrafos.map(p => [p])]), [MARCA]] });
}

export async function gerarLgpd(saida: string, casos: number, semente: number) {
  const r = rng(semente);
  const total = casos * DOCUMENTOS_POR_CASO;
  const tipos = r.shuffle(Array.from({ length: total }, (_, n) => SEQUENCIA[n % SEQUENCIA.length]));
  const docs = tipos.map((t, n) => ({ tipo: t, doc: TIPOS[t](rng(semente * 1000 + n + 1), n) }));
  // Perguntas: 20 no total, espalhadas pelos casos.
  const porCaso = Array.from({ length: casos }, (_, c) => Math.floor(PERGUNTAS_TOTAL / casos) + (c < PERGUNTAS_TOTAL % casos ? 1 : 0));
  const nomes: string[] = [];
  for (let c = 0; c < casos; c++) {
    const lote = docs.slice(c * DOCUMENTOS_POR_CASO, (c + 1) * DOCUMENTOS_POR_CASO);
    const usados = new Set<string>();
    const arquivos: { nome: string; doc: Doc }[] = lote.map(({ doc }) => {
      let nome = `${doc.base}.${doc.formato}`;
      for (let k = 2; usados.has(nome); k++) nome = `${doc.base}-${k}.${doc.formato}`;
      usados.add(nome);
      return { nome, doc };
    });
    const files = [];
    for (const a of arquivos) files.push({ nome: a.nome, bytes: await bytesDe(a.doc), tipo: a.doc.formato === 'xlsx' ? 'planilha' as const : 'digital' as const });
    const documentos = arquivos.map(a => ({ arquivo: a.nome, categoria: a.doc.categoria, periodo: a.doc.periodo, nome: a.doc.categoria && a.doc.periodo ? nomePadrao(a.doc.categoria, a.doc.periodo, a.nome) : null }));
    // Uma pergunta por documento classificado; a última do caso pede todos os de uma categoria, quando há mais de um.
    const rc = rng(semente * 7919 + c);
    const cand = rc.shuffle(arquivos.filter(a => a.doc.pergunta));
    const perguntas: { pergunta: string; documentos: string[] }[] = [];
    const grupos = new Map<string, string[]>();
    for (const a of arquivos) if (a.doc.grupo) grupos.set(a.doc.grupo, [...(grupos.get(a.doc.grupo) ?? []), a.nome]);
    const agregado = [...grupos].find(([, v]) => v.length > 1);
    const AGREGADA: Record<string, string> = { politicas: 'Quais são as políticas e normas deste lote, inclusive as atas que as aprovam ou revisam?', treinamentos: 'Quais são as evidências de treinamento deste lote?', contratos: 'Quais são os contratos com operadores deste lote?', incidentes: 'Quais são os documentos de incidentes deste lote, inclusive as atas que os analisam?', registros: 'Quais são os registros de operações de tratamento deste lote (inventários e atas que os revisam)?' };
    for (let q = 0; q < porCaso[c]; q++) {
      if (agregado && q === porCaso[c] - 1) { perguntas.push({ pergunta: AGREGADA[agregado[0]], documentos: agregado[1] }); continue; }
      const a = cand[q % cand.length];
      perguntas.push({ pergunta: q < cand.length ? a.doc.pergunta! : `De novo, em outras palavras: ${a.doc.pergunta!.charAt(0).toLowerCase()}${a.doc.pergunta!.slice(1)}`, documentos: [a.nome] });
    }
    const caso = `lgpd-lote-${String(c + 1).padStart(2, '0')}`;
    const dir = join(saida, 'lgpd', caso);
    const gravados = gravar(dir, files);
    const semCat = documentos.filter(d => !d.categoria).length;
    gravarJson(join(dir, 'gabarito.json'), {
      versao: 1, caso, frente: 'lgpd', tenant: 'demonstracao', modelo: 'organizacao-evidencias', variacao: 'misto: PDF, DOCX e XLSX',
      arquivos: gravados,
      esperado: { documentos, perguntas },
      notas: [
        `${arquivos.length} documentos fictícios de LGPD, uma execução do assistente por lote. ${semCat} sem relação com LGPD (categoria nula, sem período e sem nome padronizado: vão para revisão).`,
        `Nome padronizado pela regra do modelo (${PADRAO_NOME}), com o nome do arquivo em minúsculas e hífens.`,
        'Atas do comitê de privacidade entram na categoria do assunto da pauta (política, incidente ou inventário).',
        'Parte dos arquivos tem nome genérico (scan-, documento-aprovado-, ocorrencia-, contrato-...-assinado): a categoria só aparece no conteúdo.',
        'O período é o mês da data do próprio documento (aprovação, treinamento, assinatura, ocorrência, reunião ou referência).',
        'Em XLSX com linhas de título acima da tabela (listas de presença e inventários), o título e a data ficam acima do cabeçalho: a leitura da plataforma guarda só o cabeçalho e as linhas da tabela, então a classificação por regras depende do nome do arquivo.',
        'DOC (Word 97) não entra: gerar exige o LibreOffice para escrever.',
      ].join(' '),
      conferencia: { amostra: (c + 1) % 5 === 0, por: null, em: null },
    });
    nomes.push(caso);
  }
  return nomes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', casos: '6', semente: '4303' });
  gerarLgpd(a.saida, Number(a.casos), Number(a.semente)).then(c => console.log(`${c.length} lotes da LGPD em ${join(a.saida, 'lgpd')}`));
}
