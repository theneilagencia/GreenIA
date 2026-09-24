// Pastas de admissão fictícias para o assistente de checklist de documentos
// (frente RH). Cada pasta é de uma pessoa inventada, com marca d'água
// "ESPÉCIME · DOCUMENTO FICTÍCIO" em todas as páginas, e documentos faltando de
// propósito: ausente (não entregue e não citado) ou duvidoso (só citado na
// ficha de admissão, sem o documento). O gabarito de cada pasta sai junto.
//   node --experimental-strip-types eval/fase4/gerar-rh.ts --saida eval/fase4/saida --pastas 15 --semente 4101
// Os PDFs digitais servem também de base para a impressão e as fotos de
// celular (roteiro em ROTEIRO-FOTOS.md) e para a degradação sintética (degradar.ts).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { args, gravar, gravarJson, pdf, pessoa, rng, type PdfBlock, type Pessoa, type Rng } from './lib.ts';

export const ITENS = ['rg', 'cpf', 'residencia', 'ctps', 'aso', 'titulo', 'banco'] as const;
type Item = typeof ITENS[number];
const OBRIGATORIOS: Item[] = ['rg', 'cpf', 'residencia', 'ctps', 'aso', 'banco'];
const CARGOS = ['Auxiliar administrativo', 'Técnico de segurança do trabalho', 'Analista financeiro', 'Operador de logística', 'Assistente de faturamento', 'Mestre de obras'];

const doc: Record<Item, (p: Pessoa, r: Rng) => PdfBlock[]> = {
  rg: p => [{ titulo: 'REPÚBLICA FEDERATIVA DO BRASIL · CARTEIRA DE IDENTIDADE', linhas: [`Registro Geral: ${p.rg}`, `Nome: ${p.nome.toUpperCase()}`, 'Filiação: MÃE FICTÍCIA DA SILVA / PAI FICTÍCIO DA SILVA', `Data de nascimento: ${p.nascimento}`, `Naturalidade: ${p.cidade}-${p.uf}`, 'Órgão expedidor: SSP (fictício)'] }],
  cpf: p => [{ titulo: 'Comprovante de Inscrição no Cadastro de Pessoas Físicas', linhas: [`Número de inscrição: ${p.cpf}`, `Nome: ${p.nome.toUpperCase()}`, `Data de nascimento: ${p.nascimento}`, 'Situação cadastral: REGULAR', 'Comprovante emitido para teste; sem validade.'] }],
  residencia: (p, r) => [{ titulo: 'COMPANHIA DE ENERGIA EXEMPLO · CONTA DE LUZ', linhas: [`Referência: 0${r.int(6, 8)}/2026`, `Titular: ${p.nome}`, `Endereço: ${p.endereco} · ${p.cidade}-${p.uf} · CEP ${p.cep}`, `Consumo: ${r.int(90, 320)} kWh`, `Valor: R$ ${r.int(80, 300)},${r.digits(2)}`, 'Vencimento: 10/09/2026'] }],
  ctps: (p, r) => [{ titulo: 'CARTEIRA DE TRABALHO DIGITAL · DADOS PESSOAIS', linhas: [`Nome: ${p.nome}`, `CPF: ${p.cpf}`, `Número da CTPS: ${r.digits(7)} · Série ${r.digits(4)}`, 'Contratos de trabalho: 1 contrato anterior (Empresa Exemplo Ltda., 2019 a 2025)'] }],
  aso: (p, r) => [{ titulo: 'ATESTADO DE SAÚDE OCUPACIONAL (ASO)', linhas: ['Tipo de exame: admissional', `Trabalhador: ${p.nome}`, `CPF: ${p.cpf}`, `Função: ${r.pick(CARGOS)}`, 'Resultado: APTO para a função', `Médico examinador: Dr. Fictício Exemplo · CRM ${r.digits(5)}-${p.uf} (fictício)`, `Data: ${String(r.int(1, 28)).padStart(2, '0')}/09/2026`] }],
  titulo: (p, r) => [{ titulo: 'JUSTIÇA ELEITORAL · TÍTULO ELEITORAL', linhas: [`Eleitor: ${p.nome}`, `Inscrição: ${r.digits(4)} ${r.digits(4)} ${r.digits(4)}`, `Zona: ${r.digits(3)} · Seção: ${r.digits(4)}`, `Município: ${p.cidade}-${p.uf}`] }],
  banco: (p, r) => [{ titulo: 'BANCO EXEMPLO S.A. · COMPROVANTE DE CONTA SALÁRIO', linhas: [`Titular: ${p.nome}`, `CPF: ${p.cpf}`, `Agência: ${r.digits(4)} · Conta salário: ${r.digits(6)}-${r.int(0, 9)}`, 'Documento para cadastro na folha de pagamento.'] }],
};

// Como a ficha cita um item entregue só na ficha (duvidoso).
const citacao: Record<Item, (r: Rng) => string> = {
  rg: r => `RG: ${r.digits(2)}.${r.digits(3)}.${r.digits(3)}-${r.int(0, 9)} (informado pelo candidato; documento não anexado)`,
  cpf: () => 'CPF: informado pelo candidato; comprovante não anexado',
  residencia: () => 'Comprovante de residência: endereço informado na ficha, comprovante a entregar',
  ctps: () => 'Carteira de trabalho: número informado; cópia a entregar',
  aso: () => 'ASO: exame admissional agendado; atestado a entregar',
  titulo: r => `Título de eleitor: inscrição ${r.digits(12)} informada pelo candidato`,
  banco: r => `Dados bancários: agência ${r.digits(4)}, conta ${r.digits(6)} (informados na ficha, sem comprovante)`,
};

const NOMES: Record<Item, string> = { rg: 'rg.pdf', cpf: 'cpf.pdf', residencia: 'conta-de-luz.pdf', ctps: 'ctps-digital.pdf', aso: 'aso-admissional.pdf', titulo: 'titulo-eleitor.pdf', banco: 'comprovante-conta-salario.pdf' };

export async function gerarRh(saida: string, pastas: number, semente: number) {
  const casos: string[] = [];
  for (let n = 1; n <= pastas; n++) {
    const r = rng(semente * 1000 + n);
    const p = pessoa(r);
    const cargo = r.pick(CARGOS);
    // Situação de cada item: a pasta 1 é completa (controle); nas outras, 1 ou 2 ausentes e às vezes 1 duvidoso.
    const sit = new Map<Item, 'presente' | 'ausente' | 'duvidoso'>(ITENS.map(i => [i, 'presente']));
    if (n > 1) {
      for (const i of r.shuffle(ITENS).slice(0, r.int(1, 2))) sit.set(i, 'ausente');
      if (r.next() < 0.6) { const d = r.pick(ITENS.filter(i => sit.get(i) === 'presente')); sit.set(d, 'duvidoso'); }
      if (r.next() < 0.3) sit.set('titulo', 'ausente');                 // opcional: muitas vezes não vem
    }
    const files: { nome: string; bytes: Uint8Array; tipo: 'digital' }[] = [];
    const arquivoDe = new Map<Item, string>();
    // Às vezes RG e CPF vêm juntos num PDF de duas páginas.
    const juntos = sit.get('rg') === 'presente' && sit.get('cpf') === 'presente' && r.next() < 0.4;
    if (juntos) {
      files.push({ nome: 'documentos-pessoais.pdf', bytes: await pdf([doc.rg(p, r), doc.cpf(p, r)]), tipo: 'digital' });
      arquivoDe.set('rg', 'documentos-pessoais.pdf'); arquivoDe.set('cpf', 'documentos-pessoais.pdf');
    }
    for (const i of ITENS) {
      if (sit.get(i) !== 'presente' || arquivoDe.has(i)) continue;
      files.push({ nome: NOMES[i], bytes: await pdf([doc[i](p, r)]), tipo: 'digital' });
      arquivoDe.set(i, NOMES[i]);
    }
    const ficha: PdfBlock[] = [{ titulo: 'FICHA DE ADMISSÃO', linhas: [`Nome: ${p.nome}`, `Cargo: ${cargo}`, `Data de nascimento: ${p.nascimento}`, `Endereço: ${p.endereco} · ${p.cidade}-${p.uf}`, 'Início previsto: 01/10/2026'] }];
    const duvidosos = ITENS.filter(i => sit.get(i) === 'duvidoso');
    if (duvidosos.length) ficha.push({ titulo: 'Observações do RH', linhas: duvidosos.map(i => citacao[i](r)) });
    files.push({ nome: 'ficha-de-admissao.pdf', bytes: await pdf([ficha]), tipo: 'digital' });
    for (const i of duvidosos) arquivoDe.set(i, 'ficha-de-admissao.pdf');

    const caso = `rh-pasta-${String(n).padStart(2, '0')}`;
    const dir = join(saida, 'rh', caso);
    const arquivos = gravar(dir, files);
    gravarJson(join(dir, 'gabarito.json'), {
      versao: 1, caso, frente: 'rh', tenant: 'demonstracao', modelo: 'checklist-documentos-admissao', variacao: 'digital',
      arquivos,
      esperado: {
        itens: ITENS.map(i => ({ item: i, situacao: sit.get(i)!, arquivo: arquivoDe.get(i) ?? null })),
        erroGrave: 'item marcado presente quando está ausente',
      },
      notas: `Pessoa fictícia (${p.nome}). Obrigatórios: ${OBRIGATORIOS.join(', ')}; título de eleitor é opcional. Duvidoso: citado só na ficha, sem o documento.${sit.get('cpf') !== 'presente' ? ' O número do CPF aparece em outros documentos (ASO, CTPS, conta salário); isso não é o comprovante de inscrição.' : ''}`,
      conferencia: { amostra: n % 5 === 0, por: null, em: null },
    });
    casos.push(caso);
  }
  mkdirSync(join(saida, 'rh'), { recursive: true });
  writeFileSync(join(saida, 'rh', 'ROTEIRO-FOTOS.md'), ROTEIRO);
  return casos;
}

const ROTEIRO = `# Roteiro das fotos de celular (frente RH)

Imprima os PDFs de cada pasta (rh-pasta-NN) em papel comum, com a marca d'água visível. Fotografe cada página:

- iPhone: formato HEIC (padrão da câmera). Android: JPG.
- Varie de propósito: papel sobre a mesa com ângulo de 15 a 30 graus; sombra da mão ou do celular sobre parte da página; luz baixa (fim de tarde, sem flash); desfoque leve (foto tirada em movimento); página inteira no quadro em metade das fotos, cortando a borda na outra metade.
- Pelo menos 40 fotos no total, espalhadas pelas pastas.
- Nome do arquivo: o mesmo do PDF, trocando a extensão (ex.: rh-pasta-03/fotos/conta-de-luz.heic). Documento de duas páginas: sufixo -p1 e -p2.

Depois, rode \`node --experimental-strip-types eval/fase4/variante.ts --caso <pasta> --imagens <pasta das fotos> --origem foto-manual --tipo foto\` para cada pasta: o script cria o caso da variação com o mesmo gabarito e os sha256 das fotos.
`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2), { saida: 'eval/fase4/saida', pastas: '15', semente: '4101' });
  gerarRh(a.saida, Number(a.pastas), Number(a.semente)).then(c => console.log(`${c.length} pastas de RH em ${join(a.saida, 'rh')}`));
}
