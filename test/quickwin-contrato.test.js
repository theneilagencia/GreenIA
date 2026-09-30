// Autoridade do contrato confirmado (regressão do smoke test de produção do RC2): a pessoa confirmou
// "Cliente | Valor", mas a conferência pela IA seguiu o objetivo original ("... Cliente, Valor e Status"), reprovou
// o resultado certo e a correção recolocou Status. Aqui um "modelo" falso reproduz esse comportamento: o conferente
// exige todo campo que encontra no texto que recebe (inclusive no objetivo) e a correção acrescenta a coluna que o
// conferente disser que faltou. O que o código consegue comparar passa a ser conferido só pelo código.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/quickwin-construtor.js';

const OBJ = 'Gere uma tabela com Cliente, Valor e Status.';
const estruturaDe = (descricao, nomes) => ({ chave: C.chaveObjetivo(descricao), colunas: nomes.map(n => ({ nome: n, evidencia: n })), falhou: false });
const especCom = (colunas, { descricao = OBJ, nomesObjetivo = ['Cliente', 'Valor', 'Status'], regras_proprias = [] } = {}) => {
  const e = C.construir({ descricao, formato: 'tabela', estrutura_objetivo: estruturaDe(descricao, nomesObjetivo), colunas, colunas_origem: 'pessoa', regras: ['nao_inventar'], regras_proprias });
  secoesAtuais = e.formato_saida.secoes;
  return e;
};
const tabela = cols => `| ${cols.join(' | ')} |\n|${cols.map(() => '---').join('|')}|\n| ${cols.map((c, i) => (i ? `v${i}` : 'Alfa Comércio')).join(' | ')} |`;
// Resultado completo: a tabela e as seções que o contrato pede.
let secoesAtuais = [];
const resultado = cols => `${tabela(cols)}\n\n${secoesAtuais.map(x => `## ${x}\n- Nenhuma`).join('\n\n')}`;
const cabecalho = t => (/^\| (.+) \|$/m.exec(t)?.[1] || '').split(' | ');
const CAMPOS = /\b(Cliente|Valor total|Valor|Status|Situação|Responsável)\b/g;
const texto = m => (typeof m.content === 'string' ? m.content : m.content.map(p => p.text).join('\n'));

// "Modelo" com o comportamento observado em produção. `semantica`: a regra própria falha na primeira conferência.
// `teimosa`: a correção não tira coluna. `acrescenta`: a correção sempre acrescenta Status.
function modelo({ semantica = false, teimosa = false, acrescenta = false } = {}) {
  const chamadas = [];
  let regraFalhou = false;
  const chamar = async msgs => {
    chamadas.push(msgs);
    const sis = texto(msgs[0]);
    if (sis.includes('conferente de qualidade')) {
      const pedidos = [...new Set(sis.match(CAMPOS) || [])];
      const cab = cabecalho(texto(msgs[1]).split('<resultado')[1] || '');
      const faltam = pedidos.filter(c => !cab.includes(c));
      const criterios = [...sis.matchAll(/^- ([a-z_0-9]+):/gm)].map(m => m[1]);
      const falhaRegra = semantica && !regraFalhou && criterios.includes('propria_1');
      if (falhaRegra) regraFalhou = true;
      return { texto: JSON.stringify({ criterios: criterios.map(id => ({
        id, ok: !((id === 'completo' || id === 'formato') && faltam.length) && !(id === 'propria_1' && falhaRegra),
        motivo: id === 'propria_1' && falhaRegra ? 'os vencidos não foram destacados' : faltam.length ? `faltou a coluna ${faltam.join(', ')}` : '' })) }), custo: 0.001 };
    }
    // Correção: parte do resultado anterior e segue os problemas apontados.
    const pedido = texto(msgs.at(-1)), anterior = texto(msgs.at(-2));
    let cols = cabecalho(anterior);
    for (const m of pedido.matchAll(/(?:faltou a coluna|Faltaram as colunas:) ([^\n.)]+)/g)) for (const c of m[1].split(', ')) if (!cols.includes(c)) cols.push(c);
    if (!teimosa) for (const m of pedido.matchAll(/Colunas fora do combinado: ([^.]+)\./g)) cols = cols.filter(c => !m[1].split(', ').includes(c));
    if (acrescenta && !cols.includes('Status')) cols.push('Status');
    const resto = anterior.split('\n').filter(l => !/^\|/.test(l)).join('\n');
    return { texto: `${tabela(cols)}\n${resto}${/vencidos/.test(pedido) ? '\n\nDocumentos vencidos destacados.' : ''}`, custo: 0.001 };
  };
  return { chamar, chamadas };
}
const executar = (espec, resposta, m = modelo()) => C.conferirComCorrecao({ espec, resposta, entrada: 'Cobranças fictícias: Alfa 1.200 pago; Beta 3.400 em aberto.', mensagens: [{ role: 'system', content: C.promptExecucao(espec, { nome: 'X' }) }, { role: 'user', content: 'material' }], chamar: m.chamar });

test('caso real de produção: contrato Cliente | Valor, resultado Cliente | Valor → aprovado, sem correção, sem Status', async () => {
  const e = especCom(['Cliente', 'Valor']);
  assert.deepEqual(C.conferirContrato(e, resultado(['Cliente', 'Valor'])).falhas, [], 'contrato automático aprovado');
  const m = modelo();
  const r = await executar(e, resultado(['Cliente', 'Valor']), m);
  assert.equal(r.registro.status, 'aprovado');
  assert.equal(r.registro.tentativas, 0, 'nenhuma correção');
  assert.deepEqual(cabecalho(r.texto), ['Cliente', 'Valor']);
  // A conferência não recebe Status: nem no objetivo (intenção sem a estrutura antiga), nem nos critérios.
  const qc = texto(m.chamadas[0][0]);
  assert.doesNotMatch(qc, /Status/);
  assert.match(qc, /Intenção do trabalho: Gere uma tabela com \[os campos do contrato confirmado\]\./);
  assert.match(qc, /Contrato confirmado pelo responsável: tabela com exatamente as colunas Cliente \| Valor, nesta ordem/);
  assert.doesNotMatch(qc, /^- formato:/m, 'formato de tabela confirmado é conferido pelo código, não pela IA');
});

test('coluna extra: Cliente | Valor | Status fora do contrato Cliente | Valor → formato falha; corrigido só se voltar ao contrato', async () => {
  const e = especCom(['Cliente', 'Valor']);
  const d = C.conferirContrato(e, resultado(['Cliente', 'Valor', 'Status']));
  assert.deepEqual(d.falhas, ['formato']);
  assert.match(d.detalhes.join(' '), /Colunas fora do combinado: Status\./);
  // Correção que obedece ao contrato: volta a Cliente | Valor e fica "corrigido".
  const ok = await executar(e, resultado(['Cliente', 'Valor', 'Status']));
  assert.equal(ok.registro.status, 'corrigido');
  assert.deepEqual(cabecalho(ok.texto), ['Cliente', 'Valor']);
  // Correção que insiste na coluna extra: termina "inconsistente", nunca aceito.
  const nao = await executar(e, resultado(['Cliente', 'Valor', 'Status']), modelo({ teimosa: true }));
  assert.equal(nao.registro.status, 'inconsistente');
  assert.deepEqual(nao.registro.falhas, ['formato']);
});

test('correção por outro motivo: resolve a regra e continua exatamente Cliente | Valor; Status nunca reaparece', async () => {
  const e = especCom(['Cliente', 'Valor'], { regras_proprias: ['Destacar documentos vencidos'] });
  const m = modelo({ semantica: true });
  const r = await executar(e, resultado(['Cliente', 'Valor']), m);
  assert.equal(r.registro.status, 'corrigido');
  assert.deepEqual(cabecalho(r.texto), ['Cliente', 'Valor']);
  assert.match(r.texto, /Documentos vencidos destacados/);
  assert.match(texto(m.chamadas[1].at(-1)), /Mantenha exatamente estas colunas, nesta ordem: Cliente \| Valor\./);
  // Barreira: uma correção que resolve a regra mas acrescenta Status é descartada; o resultado original segue.
  const b = await executar(e, resultado(['Cliente', 'Valor']), modelo({ semantica: true, acrescenta: true }));
  assert.equal(b.registro.status, 'inconsistente');
  assert.equal(b.registro.correcao_descartada, 'contrato');
  assert.deepEqual(cabecalho(b.texto), ['Cliente', 'Valor']);
  assert.doesNotMatch(b.texto, /Status/);
});

test('renomeação: Cliente | Valor total | Situação na execução, conferência e correção; Valor e Status não voltam', async () => {
  const e = especCom(['Cliente', 'Valor total', 'Situação'], { regras_proprias: ['Destacar documentos vencidos'] });
  assert.match(C.promptExecucao(e, { nome: 'X' }), /nestas colunas: Cliente \| Valor total \| Situação\./);
  const m = modelo({ semantica: true });
  const r = await executar(e, resultado(['Cliente', 'Valor total', 'Situação']), m);
  assert.equal(r.registro.status, 'corrigido');
  assert.deepEqual(cabecalho(r.texto), ['Cliente', 'Valor total', 'Situação']);
  const qc = texto(m.chamadas[0][0]);
  assert.match(qc, /exatamente as colunas Cliente \| Valor total \| Situação/);
  assert.doesNotMatch(qc.replace(/Valor total/g, ''), /\bValor\b|Status/, 'o conferente não recebe os nomes antigos');
  assert.match(texto(m.chamadas[1].at(-1)), /Mantenha exatamente estas colunas, nesta ordem: Cliente \| Valor total \| Situação\./);
  assert.deepEqual(C.conferirContrato(e, resultado(['Cliente', 'Valor', 'Status'])).falhas, ['formato'], 'os nomes antigos ficam fora do contrato');
});

test('adição manual: Responsável passa a ser exigido; o objetivo original não limita o contrato', async () => {
  const obj = 'Gere uma tabela com Cliente e Valor.';
  const e = especCom(['Cliente', 'Valor', 'Responsável'], { descricao: obj, nomesObjetivo: ['Cliente', 'Valor'] });
  const d = C.conferirContrato(e, resultado(['Cliente', 'Valor']));
  assert.deepEqual(d.falhas, ['formato']);
  assert.match(d.detalhes.join(' '), /Faltaram as colunas: Responsável\./);
  assert.deepEqual(C.conferirContrato(e, resultado(['Cliente', 'Valor', 'Responsável'])).falhas, []);
  const r = await executar(e, resultado(['Cliente', 'Valor']));
  assert.equal(r.registro.status, 'corrigido');
  assert.deepEqual(cabecalho(r.texto), ['Cliente', 'Valor', 'Responsável']);
});

test('ordem confirmada faz parte do contrato; especificação sem confirmação continua tolerante como antes', () => {
  const e = especCom(['Status', 'Cliente', 'Valor']);
  assert.match(C.conferirContrato(e, resultado(['Cliente', 'Valor', 'Status'])).detalhes.join(' '), /não estão na ordem combinada: Status \| Cliente \| Valor\./);
  assert.deepEqual(C.conferirContrato(e, resultado(['Status', 'Cliente', 'Valor'])).falhas, []);
  // Sem configuração confirmada (API antiga / Quick Win antigo): coluna a mais é aceita e a IA ainda confere o formato.
  const antiga = C.construir({ descricao: OBJ });
  assert.equal(antiga.configuracao_confirmada, undefined);
  assert.doesNotMatch(C.conferirContrato(antiga, tabela(['Item', 'Descrição', 'Observação', 'Extra'])).detalhes.join(' '), /colunas/i, 'coluna a mais aceita, como antes');
  assert.ok(antiga.criterios_qualidade.some(c => c.id === 'formato'));
  assert.match(C.promptQualidade(antiga), /Objetivo do trabalho: Gere uma tabela com Cliente, Valor e Status\./);
});

test('intenção do trabalho: sem estrutura localizável e colunas da pessoa, o texto original não vai para a conferência', () => {
  const semEstrutura = C.construir({ descricao: OBJ, formato: 'tabela', colunas: ['Cliente', 'Valor'], colunas_origem: 'pessoa' });
  assert.doesNotMatch(C.intencaoDoTrabalho(semEstrutura), /Status/);
  assert.doesNotMatch(C.promptQualidade(semEstrutura), /Status/);
  // Objetivo sem campos nomeados: vai como está (nada a conflitar).
  const aberto = C.construir({ descricao: 'Faça uma tabela com os principais pontos.', formato: 'tabela', estrutura_objetivo: estruturaDe('Faça uma tabela com os principais pontos.', []), colunas: ['Ponto', 'Detalhe'], colunas_origem: 'pessoa' });
  assert.equal(C.intencaoDoTrabalho(aberto), 'Faça uma tabela com os principais pontos.');
});

// Alinhamento da execução: um executor que comenta todo campo que encontra no prompt e não entrega (como a execução
// 3 do smoke test do RC3, que escreveu "Status não foi incluído…") não tem de onde tirar Status.
test('execução recebe a intenção do contrato: Status removido não aparece em nenhuma parte da saída', async () => {
  const e = especCom(['Cliente', 'Valor']);
  const sis = C.promptExecucao(e, { nome: 'X' });
  assert.doesNotMatch(sis, /Status/, 'nada do que vai para a execução cita Status');
  assert.match(sis, /Intenção do trabalho: Gere uma tabela com \[os campos do contrato confirmado\]\./);
  assert.match(sis, /nestas colunas: Cliente \| Valor\./);
  const executor = prompt => {
    const citados = [...new Set(prompt.match(CAMPOS) || [])], contrato = (/nestas colunas: ([^.]+)\./.exec(prompt)?.[1] || '').split(' | ');
    const fora = citados.filter(c => !contrato.includes(c));
    return `${resultado(contrato)}${fora.length ? `\n\n${fora.map(c => `${c} não foi incluído conforme formato solicitado.`).join(' ')}` : ''}`;
  };
  const saida = executor(sis);
  assert.doesNotMatch(saida, /Status/);
  const r = await executar(e, saida);
  assert.equal(r.registro.status, 'aprovado');
  assert.doesNotMatch(r.texto, /Status/);
  // Especificação sem confirmação: o objetivo original continua indo como antes.
  assert.match(C.promptExecucao(C.construir({ descricao: OBJ }), { nome: 'X' }), /Objetivo: Gere uma tabela com Cliente, Valor e Status\./);
});
