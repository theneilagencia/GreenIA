// Documentos fictícios da construtora de demonstração, para duas áreas do
// segundo tenant na Fase 4:
//   Suprimentos  especificação de compra (XLSX, com a coluna Código) e cotações
//                de fornecedores (PDF ou DOCX), com divergências plantadas e
//                registradas no gabarito: quantidade, unidade, item faltante na
//                cotação e item cotado sem especificação. Um caso = uma
//                especificação + uma cotação (é como o assistente roda).
//   Jurídico     contratos de fornecimento e empreitada (DOCX ou PDF, 5 a 40
//                páginas), com as cláusulas que o assistente extrai (partes,
//                vigência, reajuste, multa, rescisão, confidencialidade, foro);
//                parte dos contratos sem alguma cláusula (esperado: nulo). Mais
//                20 perguntas com o contrato, a cláusula e o trecho esperados.
//   node --experimental-strip-types eval/fase4/gerar-construtora.ts --saida eval/fase4/saida --especificacoes 20 --contratos 25 --semente 4201
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, brl, docx, gravar, gravarJson, pdf, rng, xlsx, type PdfBlock, type Rng } from './lib.ts';

const MATERIAIS = [
  ['CIM-032', 'Cimento CP II-E-32, saco 50 kg', 'sc'], ['ACO-050', 'Aço CA-50 10 mm, barra 12 m', 'br'], ['ACO-060', 'Aço CA-60 5 mm, barra 12 m', 'br'],
  ['ARE-MED', 'Areia média lavada', 'm³'], ['BRI-001', 'Brita 1', 'm³'], ['BLO-014', 'Bloco de concreto 14x19x39', 'un'], ['TIJ-009', 'Tijolo cerâmico 9x19x19', 'mil'],
  ['CAB-006', 'Cabo flexível 6 mm², rolo 100 m', 'rl'], ['TUB-100', 'Tubo PVC esgoto 100 mm, barra 6 m', 'br'], ['ARG-AC3', 'Argamassa colante AC-III, saco 20 kg', 'sc'],
  ['TEL-Q92', 'Tela soldada Q-92, painel 2x3 m', 'pç'], ['CAL-HID', 'Cal hidratada CH-III, saco 20 kg', 'sc'], ['IMP-ASF', 'Manta asfáltica 4 mm, rolo 10 m²', 'rl'],
  ['FOR-COM', 'Forma de compensado plastificado 18 mm', 'ch'], ['PRE-TER', 'Prego 18x27 com cabeça, caixa 1 kg', 'cx'],
] as const;
// Unidade trocada que a cotação costuma trazer (a divergência de unidade plantada).
const TROCA: Record<string, string> = { 'm³': 'ton', sc: 'kg', br: 'kg', un: 'mil', mil: 'un', rl: 'm', pç: 'm²', ch: 'm²', cx: 'kg' };
const FORNECEDORES = ['Casa do Construtor Exemplo Ltda.', 'Depósito Fictício de Materiais S.A.', 'Aços Modelo Distribuidora Ltda.', 'Madeireira Teste Ltda.', 'Elétrica Exemplo Comércio Ltda.', 'Hidráulica Fictícia Ltda.'];
const OBRAS = ['Residencial Jardim das Acácias', 'Galpão Logístico Km 12', 'Escola Municipal Exemplo', 'Edifício Comercial Centro'];

type Divergencia = { codigo: string; tipo: 'quantidade' | 'unidade' | 'faltante_na_cotacao' | 'sem_especificacao'; especificado: string | number | null; cotado: string | number | null };

export async function gerarSuprimentos(saida: string, especificacoes: number, semente: number) {
  const casos: string[] = [];
  for (let e = 1; e <= especificacoes; e++) {
    const r = rng(semente * 1000 + e);
    const obra = r.pick(OBRAS);
    const itens = r.shuffle(MATERIAIS).slice(0, r.int(5, 9)).map(([codigo, descricao, unidade]) => ({ codigo, descricao, unidade, quantidade: r.int(2, 60) * (unidade === 'm³' ? 1 : 5) }));
    const especNome = `especificacao-compra-${String(e).padStart(2, '0')}.xlsx`;
    const especBytes = await xlsx({ 'Especificação': [
      [`Especificação de compra · ${obra} · ESPÉCIME, DOCUMENTO FICTÍCIO`], [],
      ['Código', 'Descrição', 'Quantidade', 'Unidade'], ...itens.map(i => [i.codigo, i.descricao, i.quantidade, i.unidade]),
    ] });
    for (const [k, fornecedor] of r.shuffle(FORNECEDORES).slice(0, 3).entries()) {
      const rc = rng(semente * 100000 + e * 10 + k);
      const div: Divergencia[] = [];
      // Cada cotação recebe de 0 a 3 divergências plantadas; a primeira de cada especificação vem limpa (controle).
      const n = k === 0 ? 0 : rc.int(1, 3);
      const alvo = rc.shuffle(itens).slice(0, n);
      const tipos = alvo.map(() => rc.pick(['quantidade', 'unidade', 'faltante_na_cotacao'] as const));
      const cot: { codigo: string; descricao: string; quantidade: number; unidade: string; preco_unitario: number }[] = [];
      for (const i of itens) {
        const t = tipos[alvo.indexOf(i)];
        if (t === 'faltante_na_cotacao') { div.push({ codigo: i.codigo, tipo: t, especificado: i.quantidade, cotado: null }); continue; }
        let q = i.quantidade, u: string = i.unidade;
        if (t === 'quantidade') { q = i.quantidade + rc.pick([-1, 1]) * rc.int(1, Math.max(1, Math.round(i.quantidade * 0.3))); div.push({ codigo: i.codigo, tipo: t, especificado: i.quantidade, cotado: q }); }
        if (t === 'unidade') { u = TROCA[i.unidade] ?? 'un'; div.push({ codigo: i.codigo, tipo: t, especificado: i.unidade, cotado: u }); }
        cot.push({ codigo: i.codigo, descricao: i.descricao, quantidade: q, unidade: u, preco_unitario: Number((rc.int(500, 90000) / 100).toFixed(2)) });
      }
      if (k === 2 && rc.next() < 0.5) {                                // item a mais, sem especificação
        const [codigo, descricao, unidade] = rc.pick(MATERIAIS.filter(m => !itens.some(i => i.codigo === m[0])));
        cot.push({ codigo, descricao, quantidade: rc.int(1, 20), unidade, preco_unitario: Number((rc.int(500, 20000) / 100).toFixed(2)) });
        div.push({ codigo, tipo: 'sem_especificacao', especificado: null, cotado: cot.at(-1)!.quantidade });
      }
      const validade = `${String(rc.int(1, 28)).padStart(2, '0')}/10/2026`;
      const linhas = cot.map(c => `${c.codigo} · ${c.descricao} · ${String(c.quantidade).replace('.', ',')} ${c.unidade} · R$ ${brl(c.preco_unitario)}`);
      const total = cot.reduce((s, c) => s + c.quantidade * c.preco_unitario, 0);
      const formato = rc.pick(['pdf', 'docx'] as const);
      const cotNome = `cotacao-${String(e).padStart(2, '0')}-${k + 1}.${formato}`;
      const head = [`Fornecedor: ${fornecedor}`, `CNPJ: ${rc.digits(2)}.${rc.digits(3)}.${rc.digits(3)}/0001-${rc.digits(2)} (fictício)`, `Obra: ${obra}`, `Validade da proposta: ${validade}`, 'Condição de pagamento: 28 dias'];
      const corpo = ['Código · Descrição · Quantidade · Preço unitário', ...linhas, `Total: R$ ${brl(total)}`, 'Frete incluso para entrega na obra.'];
      const cotBytes = formato === 'pdf'
        ? await pdf([[{ titulo: 'PROPOSTA COMERCIAL · COTAÇÃO DE MATERIAIS', linhas: head } as PdfBlock, { linhas: corpo }]])
        : await docx('PROPOSTA COMERCIAL · COTAÇÃO DE MATERIAIS', [...head, '', ...corpo]);
      const caso = `suprimentos-${String(e).padStart(2, '0')}-${k + 1}`;
      const dir = join(saida, 'suprimentos', caso);
      const arquivos = gravar(dir, [{ nome: especNome, bytes: especBytes, tipo: 'planilha' }, { nome: cotNome, bytes: cotBytes, tipo: 'digital' }]);
      gravarJson(join(dir, 'gabarito.json'), {
        versao: 1, caso, frente: 'suprimentos', tenant: 'construtora', modelo: 'suprimentos-cotacoes-especificacao', variacao: formato,
        arquivos,
        esperado: { cotacao: { arquivo: cotNome, fornecedor, validade, itens: cot }, divergencias: div, erroGrave: 'divergência de quantidade ou unidade não apontada' },
        notas: `Obra ${obra}. ${div.length ? `${div.length} divergência(s) plantada(s).` : 'Cotação sem divergência (controle).'}`,
        conferencia: { amostra: (e * 3 + k) % 5 === 0, por: null, em: null },
      });
      casos.push(caso);
    }
  }
  return casos;
}

// ---- Jurídico -------------------------------------------------------------------------------------
const CAMPOS = ['partes', 'vigencia', 'reajuste', 'multa', 'rescisao', 'confidencialidade', 'foro'] as const;
type Campo = typeof CAMPOS[number];
const ENCHIMENTO = [
  'As especificações técnicas dos serviços constam do Anexo I, que integra este contrato para todos os fins.',
  'A CONTRATADA manterá no local da obra preposto aceito pela CONTRATANTE, para representá-la na execução do contrato.',
  'Os materiais empregados obedecerão às normas técnicas aplicáveis e às especificações do projeto executivo.',
  'A fiscalização da CONTRATANTE não exclui nem reduz a responsabilidade da CONTRATADA pela execução dos serviços.',
  'Os pagamentos serão feitos mediante medição mensal aprovada pela fiscalização, em até 28 dias da aprovação.',
  'A CONTRATADA apresentará mensalmente as guias de recolhimento dos encargos trabalhistas e previdenciários.',
  'Fica vedada a subcontratação total do objeto; a parcial depende de autorização prévia e por escrito.',
];

function clausulas(r: Rng, contratante: string, contratada: string): Record<Campo, string> {
  return {
    partes: `CONTRATANTE: ${contratante}, inscrita no CNPJ ${r.digits(2)}.${r.digits(3)}.${r.digits(3)}/0001-${r.digits(2)}; CONTRATADA: ${contratada}.`,
    vigencia: `O presente contrato vigorará por ${r.pick([6, 12, 18, 24])} meses a contar da data de sua assinatura, podendo ser prorrogado por termo aditivo.`,
    reajuste: `Os preços serão reajustados anualmente pela variação do ${r.pick(['INCC-DI', 'IPCA', 'IGP-M'])}, tomando como base o mês da proposta.`,
    multa: `O atraso injustificado na entrega sujeitará a CONTRATADA à multa de ${r.pick(['0,33%', '0,5%', '1%'])} por dia sobre o valor da parcela em atraso, limitada a ${r.pick(['10%', '15%', '20%'])} do valor total do contrato.`,
    rescisao: `O contrato poderá ser rescindido por qualquer das partes mediante aviso prévio de ${r.pick([15, 30, 60])} dias, ou de imediato em caso de descumprimento de obrigação contratual.`,
    confidencialidade: 'As partes manterão sigilo sobre as informações técnicas e comerciais a que tiverem acesso em razão deste contrato, durante sua vigência e por 5 anos após o término.',
    foro: `Fica eleito o foro da comarca de ${r.pick(['Campinas-SP', 'Curitiba-PR', 'Goiânia-GO', 'Recife-PE'])} para dirimir as questões oriundas deste contrato.`,
  };
}

export async function gerarJuridico(saida: string, contratos: number, semente: number) {
  const casos: string[] = [];
  const perguntas: { pergunta: string; contrato: string; campo: Campo; clausula: string | null; trecho: string | null }[] = [];
  const TIPOS = ['fornecimento de concreto usinado', 'empreitada de mão de obra de alvenaria', 'locação de equipamentos (grua e andaimes)', 'fornecimento de aço cortado e dobrado', 'instalações elétricas prediais'];
  for (let c = 1; c <= contratos; c++) {
    const r = rng(semente * 1000 + c);
    const tipo = r.pick(TIPOS);
    const contratante = 'Construtora Horizonte Ltda. (demonstração)';
    const contratada = `${r.pick(FORNECEDORES)}`;
    const cl = clausulas(r, contratante, contratada);
    // Um terço dos contratos não tem uma das cláusulas (esperado: nulo), exceto partes.
    const falta = r.next() < 0.33 ? r.pick(CAMPOS.filter(x => x !== 'partes')) : null;
    const ordem = r.shuffle(CAMPOS.filter(x => x !== 'partes' && x !== falta));
    const paginas = r.int(5, 40);
    const secoes: { titulo: string; texto: string[] }[] = [{ titulo: `CONTRATO DE ${tipo.toUpperCase()} Nº ${r.digits(3)}/2026`, texto: [cl.partes, 'As partes acima qualificadas celebram o presente contrato, que se regerá pelas cláusulas seguintes.'] }];
    const numero = new Map<Campo, string>([['partes', 'Preâmbulo']]);
    const totalClausulas = Math.max(ordem.length + 4, paginas * 2);
    const pos = new Map(ordem.map((campo, i) => [Math.floor((i + 1) * totalClausulas / (ordem.length + 1)), campo]));
    for (let n = 1; n <= totalClausulas; n++) {
      const campo = pos.get(n);
      const titulo = `CLÁUSULA ${n}ª${campo ? ' · ' + { vigencia: 'DA VIGÊNCIA', reajuste: 'DO REAJUSTE', multa: 'DAS PENALIDADES', rescisao: 'DA RESCISÃO', confidencialidade: 'DA CONFIDENCIALIDADE', foro: 'DO FORO', partes: '' }[campo] : ''}`;
      if (campo) numero.set(campo, `Cláusula ${n}ª`);
      secoes.push({ titulo, texto: campo ? [cl[campo]] : [r.pick(ENCHIMENTO), r.pick(ENCHIMENTO)] });
    }
    const formato = r.pick(['docx', 'pdf'] as const);
    const nome = `contrato-${String(c).padStart(2, '0')}.${formato}`;
    const bytes = formato === 'docx'
      ? await docx(secoes[0].titulo, secoes.flatMap((s, i) => i ? [s.titulo, ...s.texto] : s.texto))
      : await pdf(chunk(secoes, Math.ceil(secoes.length / paginas)).map(grupo => grupo.map(s => ({ titulo: s.titulo, linhas: s.texto }))));
    const caso = `juridico-contrato-${String(c).padStart(2, '0')}`;
    const dir = join(saida, 'juridico', caso);
    const arquivos = gravar(dir, [{ nome, bytes, tipo: 'digital' }]);
    const campos = Object.fromEntries(CAMPOS.map(k => [k, k === falta ? null : { clausula: numero.get(k)!, trecho: trechoChave(k, cl[k]) }]));
    gravarJson(join(dir, 'gabarito.json'), {
      versao: 1, caso, frente: 'juridico', tenant: 'construtora', modelo: 'juridico-localizar-clausulas', variacao: `${formato}, ${paginas} páginas`,
      arquivos, esperado: { contrato: nome, campos, erroGrave: 'cláusula citada com trecho que não está no contrato' },
      notas: `Contrato de ${tipo}.${falta ? ` Sem cláusula de ${falta}: o esperado é nulo.` : ''}`,
      conferencia: { amostra: c % 5 === 0, por: null, em: null },
    });
    casos.push(caso);
    if (perguntas.length < 20) {
      const campo = r.pick(CAMPOS.filter(x => x !== 'partes'));
      const TXT: Record<Campo, string> = { partes: 'Quem são as partes', vigencia: 'Qual é a vigência', reajuste: 'Qual índice reajusta os preços', multa: 'Qual é a multa por atraso', rescisao: 'Qual é o aviso prévio para rescisão', confidencialidade: 'Por quanto tempo vale o sigilo', foro: 'Qual é o foro' };
      perguntas.push({ pergunta: `${TXT[campo]} no contrato ${nome}?`, contrato: nome, campo, clausula: campo === falta ? null : numero.get(campo)!, trecho: campo === falta ? null : trechoChave(campo, cl[campo]) });
    }
  }
  gravarJson(join(saida, 'juridico', 'perguntas.json'), { versao: 1, descricao: 'Perguntas sobre cláusulas dos contratos da construtora, com o contrato, a cláusula e o trecho esperados (nulo: o contrato não tem a cláusula).', perguntas });
  return casos;
}

// Parte do texto que identifica a cláusula (o que a saída precisa conter).
function trechoChave(campo: Campo, texto: string): string {
  const m: Partial<Record<Campo, RegExp>> = { vigencia: /vigorará por \d+ meses/, reajuste: /variação do [A-Z-]+/, multa: /multa de [\d,]+% por dia/, rescisao: /aviso prévio de \d+ dias/, confidencialidade: /por 5 anos após o término/, foro: /comarca de [^ ]+/, partes: /CONTRATADA: [^.]+\./ };
  return texto.match(m[campo]!)?.[0] ?? texto.slice(0, 80);
}
const chunk = <T>(list: T[], n: number) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', especificacoes: '20', contratos: '25', semente: '4201' });
  (async () => {
    const s = await gerarSuprimentos(a.saida, Number(a.especificacoes), Number(a.semente));
    const j = await gerarJuridico(a.saida, Number(a.contratos), Number(a.semente));
    console.log(`${s.length} casos de Suprimentos e ${j.length} contratos do Jurídico em ${a.saida}`);
  })();
}
