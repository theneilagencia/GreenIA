// Consistência entre a página de vendas e o produto: cada afirmação crítica tem trecho na página, regra,
// implementação e teste (docs/claims-lp.md). Frases que viram promessa jurídica ou garantia não comprovada
// não podem aparecer nas páginas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const raiz = new URL('../', import.meta.url).pathname;
const ler = p => readFileSync(raiz + p, 'utf8');
const semTags = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const PAGINAS = ['public/vendas.html', 'public/index.html'];

test('cada afirmação crítica da página tem regra, implementação e teste existentes', () => {
  const linhas = ler('docs/claims-lp.md').split('\n').filter(l => /^\| C\d+ \|/.test(l));
  assert.ok(linhas.length >= 15);
  const pagina = semTags(ler('public/vendas.html'));
  const testes = readdirSync(raiz + 'test').filter(f => f.endsWith('.test.js')).map(f => ler('test/' + f)).join('\n');
  for (const l of linhas) {
    const [id, trecho, , impl, teste] = l.split(' | ').map(x => x.replace(/^\|\s*|\s*\|$/g, '').trim());
    const texto = trecho.replace(/`/g, '');
    assert.ok(pagina.includes(texto), `${id}: trecho não está na página: "${texto}"`);
    const [, arquivo, simbolo] = /^`([^`]+)` → `(.+)`$/.exec(impl) || [];
    assert.ok(arquivo && simbolo, `${id}: implementação mal descrita: ${impl}`);
    assert.ok(ler(arquivo).includes(simbolo), `${id}: ${arquivo} não contém "${simbolo}"`);
    const titulo = teste.replace(/`/g, '');
    assert.ok(testes.includes(`test('${titulo}'`), `${id}: teste inexistente: "${titulo}"`);
  }
});

test('as páginas não fazem promessa jurídica, não generalizam garantias e não expõem o provedor', () => {
  const PROIBIDO = [
    /garant\w*\s+(?:o\s+)?compliance/i, /compliance\s+garantid/i, /100\s*%\s+(?:em\s+)?compliance/i, /\bLGPD\b/i,
    /prote[çc][ãa]o garantida/i, /todos os modelos\s+(?:t[êe]m|tem)\s+reten/i, /nenhum modelo usa/i,
    /bloqueamos (?:seus )?dados/i, /modelos? homologad/i, /openrouter/i, /processad\w* sempre com seguran[çc]a/i,
    /\bCPF\b[^.]{0,40}\b(?:sempre )?bloquead/i,
  ];
  for (const p of PAGINAS) {
    const t = semTags(ler(p));
    for (const re of PROIBIDO) assert.doesNotMatch(t, re, `${p}: ${re}`);
  }
  // O conceito aprovado e a responsabilidade da empresa estão na página de vendas.
  const v = semTags(ler('public/vendas.html'));
  for (const frase of ['IA disponível, mas com controle', 'Permita o uso de informações sigilosas com guardrails de proteção', 'Sua empresa decide. A GreenIA aplica.',
    'Controle o custo sem contar tokens', 'permanece responsável por suas obrigações legais e regulatórias'])
    assert.ok(v.includes(frase), frase);
});

// Revisão dos claims contra o produto em c255402: as afirmações corrigidas não podem voltar (docs/claims-lp.md).
const html = ler('public/vendas.html');
const texto = semTags(html);
const frases = t => t.split(/(?<=[.!?])\s+/);

test('dados: CNPJ não é "protegido", CPF não é "protegido" nem confidencial, e cada tipo tem a sua regra', () => {
  assert.doesNotMatch(texto, /CNPJ[^.]{0,60}protegid/i, 'CNPJ descrito como protegido');
  assert.doesNotMatch(texto, /CPF · dado pessoal · (?:Protegid|confidencial)/i);
  assert.doesNotMatch(texto, /CPF[^.]{0,40}\bprotegid/i, 'CPF descrito como protegido sem ressalva');
  assert.doesNotMatch(texto, /CPF[^.]{0,30}\bconfidencia/i, 'CPF descrito como confidencial');
  assert.match(texto, /CNPJ · identificação de empresa Processado normalmente/);
  assert.match(texto, /CPF · dado pessoal Processado com controles de dado pessoal/);
  // Detectar não é proteger: nada de "Proteção antes do envio" nem de "mesmo tratamento para todos".
  assert.doesNotMatch(texto, /Proteção antes do envio/i);
  assert.doesNotMatch(texto, /todos os (?:dados|tipos)[^.]{0,40}(?:mesm[ao]|igual)/i);
  assert.match(texto, /processar normalmente, só com proteção ou não enviar/);
});

test('confidencial só por marcação reconhecida, nunca por ser uma proposta; guardrails de sigilo não são atribuídos a CPF/CNPJ', () => {
  for (const f of frases(texto).filter(x => /proposta[^.]{0,60}confidencial|confidencial[^.]{0,60}proposta/i.test(x)))
    assert.match(f, /marcad/i, `proposta tratada como confidencial sem marcação: "${f}"`);
  assert.doesNotMatch(texto, /Proposta do cliente · confidencial/i);
  for (const f of frases(texto)) {
    if (/\b(?:CPF|CNPJ)\b/.test(f)) assert.doesNotMatch(f, /guardrail/i, `guardrails atribuídos a CPF/CNPJ: "${f}"`);
  }
  // Texto de acessibilidade também (atributos não entram em semTags).
  for (const [, aria] of html.matchAll(/aria-label="([^"]+)"/g)) {
    if (/\b(?:CPF|CNPJ)\b/.test(aria)) assert.doesNotMatch(aria, /guardrail/i, aria);
  }
});

test('credenciais: a promessa fica em mensagens e anexos (base de conhecimento e quick win ainda não: pendência P1)', () => {
  assert.match(texto, /Senhas e credenciais em mensagens e anexos Nunca enviadas/);
  assert.doesNotMatch(texto, /credenciais[^.]{0,80}(?:base de conhecimento|quick win)[^.]{0,40}nunca/i);
  assert.match(ler('docs/claims-lp.md'), /\| P1 \| Credenciais em documentos da base de conhecimento e arquivos de quick win/);
});

test('ambiente: sem "infraestrutura privada/dedicada", servidor dedicado ou isolamento físico', () => {
  assert.doesNotMatch(texto, /infraestrutura (?:privada|dedicada)|servidor(?:es)? dedicad|fisicamente isolad|\bIsolad[oa]\b/i);
  assert.match(texto, /separados das outras empresas/);
});

test('fornecedor: atributos declarados, nunca garantia verificada de retenção ou treino', () => {
  assert.doesNotMatch(texto, /garant\w*[^.]{0,30}reten[çc][ãa]o zero|verific\w*[^.]{0,30}fornecedor[^.]{0,30}(?:treina|reten)|comprovadamente sem reten|fornecedor comprovad/i);
  for (const f of frases(texto).filter(x => /reten[çc][ãa]o zero|uso para treino/i.test(x))) assert.match(f, /atributos declarados/, f);
});

test('roteamento e créditos: sem troca automática de recurso; continuidade sempre com a ressalva da reserva', () => {
  assert.doesNotMatch(texto, /troca (?:é|e) feita|troca\w* automaticamente|troca autom[áa]tica/i);
  assert.match(texto, /a troca pode ser feita na classe/);
  for (const f of frases(texto).filter(x => /quando os créditos acabam|ao atingir o limite|ao chegar a 100%/i.test(x)))
    assert.match(f, /reserva/i, `continuidade sem ressalva: "${f}"`);
  assert.match(texto, /Esgotada a reserva, novas mensagens pausam/);
  assert.doesNotMatch(texto, /pessoas sem limite|sem limite de pessoas|usuários ilimitados/i);
  assert.doesNotMatch(texto, /só o necessário/i);
  assert.doesNotMatch(texto, /Só domínios autorizados/i);
  assert.doesNotMatch(texto, /nem para qual serviço/i);
});

test('telas ilustrativas: cada bloco com números tem o aviso de exemplo; o menu é o da Administração atual', () => {
  const blocos = [...html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map(m => m[0]);
  // A tela de envio (políticas) fica ao lado da foto, fora de um figure: o bloco vai da janela ao fim da seção.
  const cena = html.slice(html.indexOf('l-cena-janela'), html.indexOf('</section>', html.indexOf('l-cena-janela')));
  const comNumeros = [...blocos, cena].filter(b => /class="(?:num|l-inst-uso|m-bolha)[^"]*"/.test(b));
  assert.ok(comNumeros.length >= 5, `telas com números: ${comNumeros.length}`);
  for (const b of comNumeros) assert.match(semTags(b), /dados fictícios|exemplo ilustrativo/i, semTags(b).slice(0, 120));
  // Menu antigo (uso e gestão misturados) não volta; o topo mostra o alternador de contexto do produto.
  const topo = blocos.find(b => b.includes('m-lat'));
  assert.doesNotMatch(topo, /<b>Trabalho<\/b>/);
  assert.doesNotMatch(topo, /Pessoas e áreas/);
  assert.match(topo, /Usar GreenIA/);
  assert.match(topo, /Administração/);
  assert.match(topo, /Áreas e grupos/);
  for (const item of ['Conversas', 'Quick wins</span>', 'Conhecimento']) assert.ok(!topo.includes(item), `item de uso no menu da Administração: ${item}`);
});

test('comparação com terceiros: a página fala do que a GreenIA faz, sem generalizar sobre outros produtos', () => {
  assert.doesNotMatch(texto, /Ferramenta individual/i);
  assert.doesNotMatch(texto, /(?:outras|demais) ferramentas[^.]{0,40}(?:só|apenas|sempre|nunca)/i);
});
