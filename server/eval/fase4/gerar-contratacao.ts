// Pastas de contratação de obra fictícias da construtora de demonstração, para o
// modelo de checklist "checklist-documentos-contratacao". São os casos
// equivalentes aos erros da linha de base do RH, em outra área e com outro
// modelo, para provar que a correção é da plataforma:
//   - ART citada no contrato, sem a ART anexada (menção não é documento);
//   - PDF com dois documentos (cada item com a sua página);
//   - "art." de artigo de lei no contrato (não é ART);
//   - garantia por caução mencionada no contrato (documento ou menção);
//   - matrícula da obra (CNO) que só existe como dado mencionado.
// Marca d'água em todas as páginas. O gabarito de cada pasta sai junto.
//   node --experimental-strip-types eval/fase4/gerar-contratacao.ts --saida eval/fase4/saida --pastas 15 --semente 4501
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, docx, gravar, gravarJson, pdf, rng, type PdfBlock, type Rng } from './lib.ts';

export const ITENS = ['contrato', 'art', 'alvara', 'garantia', 'cnd', 'cno', 'cnpj'] as const;
type Item = typeof ITENS[number];
type Situacao = 'presente' | 'ausente' | 'duvidoso';

const OBRAS = ['Residencial Jardim das Acácias', 'Galpão logístico Rodovia Fictícia km 12', 'Reforma da sede administrativa', 'Edifício comercial Centro Exemplo', 'Escola municipal Bairro Novo'];
const EMPREITEIRAS = ['Construtora Fictícia Alfa Ltda.', 'Engenharia Exemplo Beta S.A.', 'Obras Modelo Gama Ltda.', 'Instalações Teste Delta Ltda.'];
const CIDADES = ['Campinas-SP', 'Curitiba-PR', 'Recife-PE', 'Goiânia-GO'];

const cnpj = (r: Rng) => `${r.digits(2)}.${r.digits(3)}.${r.digits(3)}/0001-${r.digits(2)}`;

// Documento de cada item (uma página).
const pagina: Record<Exclude<Item, 'contrato' | 'cno' | 'garantia'> | 'apolice', (r: Rng, o: Obra) => PdfBlock[]> = {
  art: (r, o) => [{ titulo: 'ANOTAÇÃO DE RESPONSABILIDADE TÉCNICA', linhas: [`Número: ${o.art}`, 'Conselho Regional de Engenharia e Agronomia (fictício)', `Responsável técnico: Eng. Fictício Exemplo · registro ${r.digits(10)}`, `Contratante: ${o.dona}`, `Obra: ${o.nome} · ${o.cidade}`, 'Atividade: execução de obra civil'] }],
  alvara: (r, o) => [{ titulo: `PREFEITURA MUNICIPAL DE ${o.cidade.split('-')[0].toUpperCase()} · ALVARÁ DE CONSTRUÇÃO`, linhas: [`Processo: ${r.digits(5)}/2026`, `Obra: ${o.nome}`, `Área construída: ${r.int(300, 9000)} m²`, 'Validade: 24 meses a partir da emissão', 'Documento fictício, sem validade.'] }],
  apolice: (r, o) => [{ titulo: 'APÓLICE DE SEGURO GARANTIA', linhas: [`Apólice: ${r.digits(12)}`, 'Seguradora: Seguros Exemplo S.A. (fictícia)', `Tomador: ${o.empreiteira}`, `Segurado: ${o.dona}`, `Importância segurada: 5% do valor do contrato`, 'Modalidade: executante construtor'] }],
  cnd: (r, o) => [{ titulo: 'CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS', linhas: [`Contribuinte: ${o.empreiteira}`, `CNPJ: ${o.cnpj}`, `Código de controle: ${r.digits(4)}.${r.digits(4)}.${r.digits(4)}`, 'Válida por 180 dias. Documento fictício.'] }],
  cnpj: (r, o) => [{ titulo: 'COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL', linhas: [`Número de inscrição: ${o.cnpj}`, `Nome empresarial: ${o.empreiteira}`, 'Situação cadastral: ATIVA', `Data de abertura: ${String(r.int(1, 28)).padStart(2, '0')}/0${r.int(1, 9)}/20${r.int(10, 20)}`] }],
};

interface Obra { nome: string; dona: string; empreiteira: string; cnpj: string; cidade: string; art: string; cno: string }

export async function gerarContratacao(saida: string, pastas: number, semente: number) {
  const casos: string[] = [];
  for (let n = 1; n <= pastas; n++) {
    const r = rng(semente * 1000 + n);
    const o: Obra = { nome: r.pick(OBRAS), dona: 'Construtora de Demonstração S.A.', empreiteira: r.pick(EMPREITEIRAS), cnpj: cnpj(r), cidade: r.pick(CIDADES),
      art: `${r.digits(4)}${r.digits(6)}`, cno: `${r.digits(2)}.${r.digits(3)}.${r.digits(5)}/${r.digits(2)}` };
    // Situação: a pasta 1 é completa; nas outras, sorteio por item.
    const sit = new Map<Item, Situacao>(ITENS.map(i => [i, 'presente']));
    // ART: anexada, citada no contrato sem anexo (duvidoso) ou ausente de todo.
    const artModo = n === 1 ? 'anexada' : r.pick(['anexada', 'citada', 'citada', 'ausente'] as const);
    const alvara = n === 1 || r.next() < 0.65;
    const garantiaModo = n === 1 ? 'apolice' : r.pick(['apolice', 'caucao', 'nenhuma'] as const);
    // Uma pasta a cada três traz a CND e o cartão CNPJ no mesmo PDF (duas páginas).
    const juntos = n % 3 === 0;
    const cndSorteio = r.pick(['anexada', 'anexada', 'citada', 'ausente'] as const);
    const cndModo = n === 1 || juntos ? 'anexada' : cndSorteio;
    const cnoNoContrato = n === 1 || r.next() < 0.7;
    const cartao = n === 1 || juntos || r.next() < 0.6;
    const contratoDocx = r.next() < 0.3;
    sit.set('art', artModo === 'anexada' ? 'presente' : artModo === 'citada' ? 'duvidoso' : 'ausente');
    sit.set('alvara', alvara ? 'presente' : 'ausente');
    sit.set('garantia', garantiaModo === 'nenhuma' ? 'ausente' : 'presente');
    sit.set('cnd', cndModo === 'anexada' ? 'presente' : cndModo === 'citada' ? 'duvidoso' : 'ausente');
    sit.set('cno', cnoNoContrato ? 'presente' : 'ausente');
    sit.set('cnpj', cartao ? 'presente' : 'ausente');

    // Contrato: quatro páginas, com "art." de lei em todas as versões.
    const p1: PdfBlock[] = [{ titulo: 'CONTRATO DE EMPREITADA GLOBAL', linhas: [`CONTRATANTE: ${o.dona}`, `CONTRATADA: ${o.empreiteira}, CNPJ ${o.cnpj}`, `OBJETO: execução da obra ${o.nome}, em ${o.cidade}.`, 'As partes contratam nos termos do art. 610 do Código Civil e do art. 55 da Lei nº 14.133/2021, no que couber.'] }];
    const p2: PdfBlock[] = [{ titulo: 'CLÁUSULA 2ª · DA EXECUÇÃO', linhas: [
      'A obra segue o projeto executivo e o memorial descritivo anexos.',
      ...(artModo !== 'ausente' ? [`O responsável técnico recolheu a ART nº ${o.art}, que integra este contrato.`] : ['A responsabilidade técnica é da CONTRATADA, na forma da lei.']),
      ...(cnoNoContrato ? [`Matrícula da obra no CNO: ${o.cno}.`] : []),
    ] }];
    const p3: PdfBlock[] = [{ titulo: 'CLÁUSULA 3ª · DAS GARANTIAS E DA REGULARIDADE', linhas: [
      garantiaModo === 'caucao' ? 'A CONTRATADA presta garantia por caução em dinheiro de 5% do valor do contrato, depositada na assinatura.'
        : garantiaModo === 'apolice' ? 'A CONTRATADA apresenta garantia de execução de 5% do valor do contrato.' : 'Não há garantia de execução nesta contratação.',
      ...(cndModo === 'citada' ? ['A CONTRATADA declara possuir CND federal válida, a apresentar em até 10 dias.'] : ['A CONTRATADA mantém a regularidade fiscal durante a execução.']),
    ] }];
    const p4: PdfBlock[] = [{ titulo: 'CLÁUSULA 4ª · DO FORO', linhas: [`Fica eleito o foro da comarca de ${o.cidade}.`, 'E, por estarem de acordo, as partes assinam este instrumento.'] }];
    const paginasContrato = [p1, p2, p3, p4];
    const files: { nome: string; bytes: Uint8Array; tipo: 'digital' }[] = [];
    const onde = new Map<Item, { arquivo: string; pagina: number }>();
    const nomeContrato = contratoDocx ? 'contrato.docx' : 'contrato.pdf';
    if (contratoDocx) files.push({ nome: nomeContrato, bytes: await docx('CONTRATO DE EMPREITADA GLOBAL', paginasContrato.flat().flatMap(b => [b.titulo ?? '', ...b.linhas]).filter(Boolean).slice(1)), tipo: 'digital' });
    else files.push({ nome: nomeContrato, bytes: await pdf(paginasContrato), tipo: 'digital' });
    // DOCX não tem páginas: o texto todo é a página 1.
    const pg = (n: number) => (contratoDocx ? 1 : n);
    onde.set('contrato', { arquivo: nomeContrato, pagina: 1 });
    if (artModo === 'citada') onde.set('art', { arquivo: nomeContrato, pagina: pg(2) });
    if (cnoNoContrato) onde.set('cno', { arquivo: nomeContrato, pagina: pg(2) });
    if (garantiaModo === 'caucao') onde.set('garantia', { arquivo: nomeContrato, pagina: pg(3) });
    if (cndModo === 'citada') onde.set('cnd', { arquivo: nomeContrato, pagina: pg(3) });

    // Documentos anexos; às vezes dois no mesmo PDF.
    const anexos: { item: Item; blocos: PdfBlock[]; nome: string }[] = [];
    if (artModo === 'anexada') anexos.push({ item: 'art', blocos: pagina.art(r, o), nome: 'art.pdf' });
    if (alvara) anexos.push({ item: 'alvara', blocos: pagina.alvara(r, o), nome: 'alvara.pdf' });
    if (garantiaModo === 'apolice') anexos.push({ item: 'garantia', blocos: pagina.apolice(r, o), nome: 'apolice-seguro-garantia.pdf' });
    if (cndModo === 'anexada') anexos.push({ item: 'cnd', blocos: pagina.cnd(r, o), nome: 'certidao-federal.pdf' });
    if (cartao) anexos.push({ item: 'cnpj', blocos: pagina.cnpj(r, o), nome: 'cartao-cnpj.pdf' });
    const par = juntos ? ['cnd', 'cnpj'] : null;
    if (par) {
      const [a, b] = par.map(i => anexos.find(x => x.item === i)!);
      files.push({ nome: 'documentos-da-contratada.pdf', bytes: await pdf([a.blocos, b.blocos]), tipo: 'digital' });
      onde.set(a.item, { arquivo: 'documentos-da-contratada.pdf', pagina: 1 });
      onde.set(b.item, { arquivo: 'documentos-da-contratada.pdf', pagina: 2 });
    }
    for (const a of anexos) {
      if (onde.has(a.item)) continue;
      files.push({ nome: a.nome, bytes: await pdf([a.blocos]), tipo: 'digital' });
      onde.set(a.item, { arquivo: a.nome, pagina: 1 });
    }

    const caso = `contratacao-${String(n).padStart(2, '0')}`;
    const dir = join(saida, 'contratacao', caso);
    const arquivos = gravar(dir, files);
    gravarJson(join(dir, 'gabarito.json'), {
      versao: 1, caso, frente: 'contratacao', tenant: 'construtora', modelo: 'checklist-documentos-contratacao',
      variacao: `${contratoDocx ? 'docx' : 'pdf'}${par ? ', dois documentos num PDF' : ''}`,
      arquivos,
      esperado: {
        itens: ITENS.map(i => ({ item: i, situacao: sit.get(i)!, arquivo: onde.get(i)?.arquivo ?? null, pagina: onde.get(i)?.pagina ?? null })),
        erroGrave: 'item marcado presente quando está ausente',
      },
      notas: `Obra fictícia (${o.nome}). ART ${artModo}; garantia ${garantiaModo}; CND ${cndModo}; CNO ${cnoNoContrato ? 'mencionado no contrato' : 'não mencionado'}. `
        + 'Duvidoso: citado no contrato sem o documento anexo. O contrato cita artigos de lei ("art. 610", "art. 55"), que não são ART. Garantia vale pela apólice ou pela caução mencionada; a matrícula CNO vale como dado mencionado. Cartão CNPJ é opcional.',
      conferencia: { amostra: n % 5 === 0, por: null, em: null },
    });
    casos.push(caso);
  }
  return casos;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', pastas: '15', semente: '4501' });
  gerarContratacao(a.saida, Number(a.pastas), Number(a.semente)).then(c => console.log(`${c.length} pastas de contratação em ${join(a.saida, 'contratacao')}`));
}
