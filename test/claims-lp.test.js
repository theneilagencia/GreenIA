// Governança da copy: docs/claims-lp.md é o registro de verdade comercial. Cada frase material das superfícies
// (página de vendas e página de entrada das empresas) aponta para uma capacidade, um arquivo, um símbolo e um teste;
// o que foi rejeitado não volta; formulações proibidas só passam dentro de uma frase registrada que as sustenta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { superficies, frases as trechos, SENSIVEL } from './claims-superficies.js';

const raiz = new URL('../', import.meta.url).pathname;
const ler = p => readFileSync(raiz + p, 'utf8');
const semTags = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const PAGINAS = ['public/vendas.html', 'public/index.html'];

// ---------------------------------------------------------------------------------------------- Registro
const ESTADOS = ['sustentado', 'sustentado_com_condicao', 'nao_sustentado', 'futuro', 'obsoleto'];
const COLUNAS = ['id', 'superficie', 'texto', 'estado', 'capacidade', 'versao', 'evidencia', 'teste', 'condicao', 'dependencia', 'proibido', 'libera', 'revisao'];
const REGISTRO = ler('docs/claims-lp.md').split('\n').filter(l => /^\| (?:LP|OUT|FUT)-[A-Z0-9-]+ \|/.test(l)).map(l => {
  const celulas = l.replace(/^\|\s*|\s*\|$/g, '').split(' | ').map(x => x.trim());
  return Object.fromEntries(COLUNAS.map((c, i) => [c, celulas[i]]));
});
const SUSTENTADOS = REGISTRO.filter(r => r.estado.startsWith('sustentado'));
const S = superficies();
const TESTES = readdirSync(raiz + 'test').filter(f => f.endsWith('.test.js')).map(f => ler('test/' + f)).join('\n');
const ids = lista => (lista === '—' ? [] : lista.split(/,\s*/));

test('registro: toda linha tem as 13 colunas, estado válido, superfície conhecida e id único', () => {
  assert.ok(SUSTENTADOS.length >= 80, `registro curto demais: ${SUSTENTADOS.length}`);
  assert.equal(new Set(REGISTRO.map(r => r.id)).size, REGISTRO.length, 'id repetido');
  for (const r of REGISTRO) {
    assert.ok(COLUNAS.every(c => r[c]), `${r.id}: coluna vazia`);
    assert.ok(ESTADOS.includes(r.estado), `${r.id}: estado inválido "${r.estado}"`);
    assert.ok(r.estado.startsWith('sustentado') ? r.superficie in S : r.superficie === 'todas', `${r.id}: superfície "${r.superficie}"`);
    assert.match(r.revisao, /^\d{4}-\d{2}-\d{2}$/, `${r.id}: revisão sem data`);
  }
});

test('registro: cada claim sustentado está na superfície, com evidência no código e teste existente', () => {
  for (const r of SUSTENTADOS) {
    assert.ok(S[r.superficie].includes(r.texto), `${r.id}: texto não está em "${r.superficie}": "${r.texto}"`);
    // 6534041: produção de referência. Os demais: commits da liberação candidata (governança, retenção, identificação legal,
    // encerramento e exportações).
    assert.ok(['6534041', 'f013ff2', '2717c99', 'b574ae3', '6c0912f', '1404812', 'f70e85c'].includes(r.versao), `${r.id}: versão mínima ${r.versao}`);
    const [, arquivo, simbolo] = /^`([^`]+)` → `(.+)`$/.exec(r.evidencia) || [];
    assert.ok(arquivo && simbolo, `${r.id}: evidência mal descrita: ${r.evidencia}`);
    assert.ok(existsSync(raiz + arquivo) && ler(arquivo).includes(simbolo), `${r.id}: ${arquivo} não contém "${simbolo}"`);
    // Teste de comportamento; fato de infraestrutura ou de atendimento declara a origem.
    if (!/^(?:configuração|serviço): /.test(r.teste)) assert.ok(TESTES.includes(`test('${r.teste}'`), `${r.id}: teste inexistente: "${r.teste}"`);
    if (r.estado === 'sustentado_com_condicao') assert.notEqual(r.condicao, '—', `${r.id}: condição não descrita`);
  }
});

test('fora da página: claims obsoletos, não sustentados e futuros não aparecem em nenhuma superfície', () => {
  const tudo = Object.values(S).join(' | ').toLowerCase();
  const fora = REGISTRO.filter(r => !r.estado.startsWith('sustentado'));
  assert.ok(fora.length >= 20);
  for (const r of fora) assert.ok(!tudo.includes(r.texto.toLowerCase()), `${r.id} (${r.estado}) voltou: "${r.texto}"`);
});

test('trechos sensíveis (dados, segurança, privacidade, custo, conferência, fornecedores) só entram com registro sustentado', () => {
  for (const [sup, texto] of Object.entries(S)) {
    const registrados = SUSTENTADOS.filter(r => r.superficie === sup).map(r => r.texto.toLowerCase());
    for (const f of new Set(trechos(texto))) {
      if (!SENSIVEL.test(f)) continue;
      assert.ok(registrados.some(t => t.includes(f.toLowerCase())), `${sup}: trecho sensível sem registro em docs/claims-lp.md: "${f}"`);
    }
  }
});

// ------------------------------------------------------------------------------------ Blacklist editorial
// Formulações comerciais rejeitadas. Uma ocorrência só passa se estiver dentro de um texto sustentado do registro
// cuja coluna "libera" cite a entrada; B20 é contextual (regras "antes do envio" precisam dizer sobre o quê).
export const BLACKLIST = {
  B01: /nunca\s+(?:são\s+)?enviad|credenciais[^.]{0,40}\bnunca\b/i,
  B02: /nunca\s+sa(?:i|em)\b|não\s+sa(?:i|em)\s+da\s+empresa|dados\s+ficam\s+(?:no\s+ambiente|na\s+empresa|dentro)/i,
  B03: /só\s+para\s+você|somente\s+para\s+você|100\s*%\s*privad|totalmente\s+privad|privacidade\s+total/i,
  B04: /resultados?\s+corret|respostas?\s+corret|resposta\s+validada|sem\s+erros|sem\s+alucina/i,
  B05: /fonte\s+citada|cita\s+a\s+fonte|mostra\s+de\s+qual\s+documento\s+veio/i,
  B06: /exclusiv|infraestrutura\s+(?:dedicada|privada)|servidor(?:es)?\s+dedicad|fisicamente\s+isolad/i,
  B07: /(?:não|nunca)\s+(?:são|é)\s+usad[oa]s?\s+para\s+trein|sem\s+treino\s+garantid|garant\w*[^.]{0,30}trein/i,
  B08: /previsíve|custo\s+garantid|gasto\s+garantid|limite\s+rígido|nunca\s+passa\s+do\s+teto|nunca\s+ultrapass/i,
  B09: /antes\s+e\s+depois|mede[^.]{0,30}resultado|resultado\s+medido/i,
  B10: /amplia\w*\s+só|decidid\w*\s+com\s+dados|decisão\s+registrada|greenia\s+decide/i,
  B11: /(?:dados|servidores?)\s+no\s+brasil|residência[^.]{0,20}brasil/i,
  B12: /\b(?:garante|garantem|garantimos|assegura|asseguramos|elimina)\b/i,
  B13: /sem\s+risco|risco\s+zero/i,
  B14: /o\s+melhor\s+modelo/i,
  B15: /ilimitad|sem\s+limite\s+de\s+(?:pessoas|usuários)|pessoas\s+sem\s+limite/i,
  B16: /na\s+hora\b|instantâne/i,
  B17: /primeira\s+semana|costumam\s+dar\s+bom\s+resultado/i,
  B18: /mais\s+contexto/i,
  B19: /você\s+escolhe\s+o\s+tipo/i,
  B21: /\bnunca\b/i,
  B22: /\bsempre\b/i,
  B25: /cópias?\s+de\s+segurança[^.]{0,60}\d+\s*dias|backups?[^.]{0,40}\d+\s*dias/i,
  B26: /\bprovar\b|comprovad|\bROI\b|retorno\s+sobre\s+o\s+investimento/i,
  B27: /sobrescrit/i,
};
const ESCOPO_DO_ENVIO = /mensage[mn]|anexo|senhas?|chaves? de acesso|documentos da base|dados são reconhecidos/i;

// Intervalos do texto cobertos por um claim sustentado que libera a entrada.
function liberados(texto, sup, id) {
  const faixas = [];
  for (const r of SUSTENTADOS.filter(x => x.superficie === sup && ids(x.libera).includes(id))) {
    for (let i = texto.indexOf(r.texto); i >= 0; i = texto.indexOf(r.texto, i + 1)) faixas.push([i, i + r.texto.length]);
  }
  return faixas;
}

test('blacklist: formulações proibidas não aparecem, salvo dentro de frase registrada que as sustenta', () => {
  for (const [sup, texto] of Object.entries(S)) {
    for (const [id, re] of Object.entries(BLACKLIST)) {
      const faixas = liberados(texto, sup, id);
      for (const m of texto.matchAll(new RegExp(re.source, 'gi'))) {
        const ok = faixas.some(([a, b]) => m.index >= a && m.index + m[0].length <= b);
        const trecho = texto.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60);
        assert.ok(ok, `${sup}: ${id} "${m[0]}" sem registro que libere: "…${trecho}…"`);
      }
    }
  }
});

test('blacklist B20: "antes do envio" sempre diz sobre o quê (mensagem, anexo, senhas e chaves, documentos da base)', () => {
  for (const [sup, texto] of Object.entries(S)) {
    for (const f of trechos(texto)) {
      if (/antes\s+(?:de\s+cada|do)\s+envio/i.test(f)) assert.match(f, ESCOPO_DO_ENVIO, `${sup}: regra "antes do envio" generalizada: "${f}"`);
    }
  }
});

// B23 e B24 são contextuais: a frase pode existir, mas precisa trazer o escopo que a torna verdadeira.
const VISIBILIDADE = /\b(?:colegas|admin)\b/i, NAO_VE = /não\s+(?:veem|vê|aparecem?|mostra)|nenhuma\s+tela/i;
test('blacklist B23: "colegas e admin não veem" só com o escopo das telas (exportação e suporte alcançam o banco)', () => {
  for (const [sup, texto] of Object.entries(S)) {
    for (const f of trechos(texto)) if (VISIBILIDADE.test(f) && NAO_VE.test(f)) assert.match(f, /\btelas?\b/i, `${sup}: visibilidade sem escopo: "${f}"`);
  }
});

test('blacklist B24: "conferido a cada execução" só com a jornada guiada (quick win em branco ou de modelo não é conferido)', () => {
  for (const [sup, texto] of Object.entries(S)) {
    for (const f of trechos(texto)) if (/conferid[oa]s?\s+a\s+cada\s+execução/i.test(f)) assert.match(f, /guiad/i, `${sup}: conferência sem escopo: "${f}"`);
  }
});

test('blacklist: cada entrada do código está documentada no registro, e cada liberação aponta para uma entrada existente', () => {
  const doc = ler('docs/claims-lp.md');
  for (const id of [...Object.keys(BLACKLIST), 'B20', 'B23', 'B24']) assert.match(doc, new RegExp(`^\\| ${id} \\|`, 'm'), `${id} sem linha na blacklist do registro`);
  for (const r of REGISTRO) for (const id of [...ids(r.libera), ...ids(r.proibido)]) assert.match(id, /^B(?:0[1-9]|1\d|2[0-7])$/, `${r.id}: entrada inexistente ${id}`);
});

test('as páginas não fazem promessa jurídica, não generalizam garantias e não expõem o provedor', () => {
  const PROIBIDO = [
    /garant\w*\s+(?:o\s+)?compliance/i, /compliance\s+garantid/i, /100\s*%\s+(?:em\s+)?compliance/i,
    // LGPD: menção objetiva, sem absoluto. Conformidade, adequação ou certificação atribuídas à GreenIA reprovam.
    /100\s*%[^.]{0,20}LGPD/i, /conformidade\s+com\s+a\s+LGPD/i, /(?:adequad|aderente|certificad|homologad|compat[íi]vel)\w*\s+(?:à|a|com\s+a)\s+LGPD/i,
    /LGPD\s+(?:garantid|assegurad|complet|total)/i, /garant\w*[^.]{0,40}\bLGPD\b|\bLGPD\b[^.]{0,40}garant/i, /cumpre\s+a\s+LGPD/i,
    /prote[çc][ãa]o garantida/i, /todos os modelos\s+(?:t[êe]m|tem)\s+reten/i, /nenhum modelo usa/i,
    /bloqueamos (?:seus )?dados/i, /modelos? homologad/i, /openrouter/i, /processad\w* sempre com seguran[çc]a/i,
    /\bCPF\b[^.]{0,40}\b(?:sempre )?bloquead/i,
  ];
  for (const p of PAGINAS) {
    const t = semTags(ler(p));
    for (const re of PROIBIDO) assert.doesNotMatch(t, re, `${p}: ${re}`);
    // Toda frase com LGPD fala dos controles que apoiam a empresa, nunca de conformidade da GreenIA.
    for (const f of t.split(/(?<=[.!?])\s+/).filter(x => /\bLGPD\b/.test(x))) assert.match(f, /apoiam/, `${p}: LGPD fora da formulação de apoio: "${f}"`);
  }
  // O conceito aprovado e a responsabilidade da empresa estão na página de vendas.
  const v = semTags(ler('public/vendas.html'));
  for (const frase of ['Sua empresa define o que pode ser enviado à IA', 'Só segue por recursos autorizados', 'tipos de dados que reconhece',
    'Os créditos mensais são compartilhados pela equipe', 'permanece responsável por suas obrigações legais e regulatórias'])
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
  // A tela mostra o que é reconhecido e o tratamento do pedido inteiro (a regra mais restritiva), não um tratamento por item.
  assert.match(texto, /CNPJ · identificação de empresa Reconhecido/);
  assert.match(texto, /CPF · dado pessoal Reconhecido/);
  assert.match(texto, /Pedido inteiro · regra mais restritiva Só por recurso autorizado/);
  assert.doesNotMatch(texto, /CNPJ · identificação de empresa Processado normalmente/, 'tratamento por item volta a sugerir que o CNPJ sai separado do pedido');
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

test('credenciais: a promessa é sobre senhas e chaves reconhecidas, em todas as partes do envio, sem absoluto (P1 resolvida)', () => {
  assert.match(texto, /Senhas e chaves de acesso reconhecidas são bloqueadas antes do envio, inclusive quando estão em documentos da base, em arquivos de quick win ou no histórico da conversa/);
  assert.doesNotMatch(texto, /credenciais[^.]{0,80}(?:base de conhecimento|quick win)[^.]{0,40}nunca/i);
  assert.doesNotMatch(texto, /(?:senhas|credenciais|chaves)[^.]{0,60}\bnunca\b|nunca\s+(?:são\s+)?enviad/i, 'absoluto sobre credenciais voltou');
  assert.match(ler('docs/claims-lp.md'), /\| P1 \| Credenciais em documentos da base de conhecimento e arquivos de quick win/);
});

test('ambiente: sem "infraestrutura privada/dedicada", servidor dedicado ou isolamento físico', () => {
  assert.doesNotMatch(texto, /infraestrutura (?:privada|dedicada)|servidor(?:es)? dedicad|fisicamente isolad|\bIsolad[oa]\b|exclusiv/i);
  assert.match(texto, /O banco de dados de cada empresa é separado/);
});

test('fornecedor: atributos declarados, nunca garantia verificada de retenção ou treino', () => {
  assert.doesNotMatch(texto, /garant\w*[^.]{0,30}reten[çc][ãa]o zero|verific\w*[^.]{0,30}fornecedor[^.]{0,30}(?:treina|reten)|comprovadamente sem reten|fornecedor comprovad/i);
  for (const f of frases(texto).filter(x => /reten[çc][ãa]o zero|uso para treino/i.test(x))) assert.match(f, /atributos declarados/, f);
});

test('roteamento e créditos: sem troca automática de recurso; continuidade sempre com a ressalva da reserva', () => {
  assert.doesNotMatch(texto, /troca (?:é|e) feita|troca\w* automaticamente|troca autom[áa]tica/i);
  assert.match(texto, /A disponibilidade de modelos pode evoluir/);
  for (const f of frases(texto).filter(x => !x.endsWith('?') && /quando os créditos acabam|ao atingir o limite|ao chegar a 100%/i.test(x)))
    assert.match(f, /reserva/i, `continuidade sem ressalva: "${f}"`);
  assert.match(texto, /Quando a reserva termina, novos envios pausam/);
  assert.doesNotMatch(texto, /pessoas sem limite|sem limite de pessoas|usuários ilimitados/i);
  assert.doesNotMatch(texto, /só o necessário/i);
  assert.doesNotMatch(texto, /Só domínios autorizados/i);
  assert.doesNotMatch(texto, /nem para qual serviço/i);
});

test('telas ilustrativas: cada bloco com números tem o aviso de exemplo; o menu é o da Administração atual', () => {
  const blocos = [...html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)].map(m => m[0]);
  // A tela de envio (políticas) fica ao lado da foto, fora de um figure: o bloco vai da janela ao fim da seção.
  const cena = html.slice(html.indexOf('l-cena-janela'), html.indexOf('</section>', html.indexOf('l-cena-janela')));
  const comNumeros = [...blocos, cena].filter(b => /class="(?:num|l-inst-uso|m-bolha|qw-demo)[^"]*"/.test(b));
  assert.ok(comNumeros.length >= 3, `telas com números: ${comNumeros.length}`);
  for (const b of comNumeros) assert.match(semTags(b), /dados fictícios|exemplo ilustrativo/i, semTags(b).slice(0, 120));
  // A gestão agora é mostrada numa captura real do produto, com dados fictícios.
  const real = blocos.find(b => b.includes('lp-gestao-demo.webp'));
  assert.ok(real, 'captura real da gestão ausente');
  assert.match(real, /Tela real da plataforma em ambiente de demonstração\. Dados fictícios/);
  assert.ok(existsSync(raiz + 'public/assets/lp-gestao-demo.webp'));

});

test('comparação com terceiros: a página fala do que a GreenIA faz, sem generalizar sobre outros produtos', () => {
  assert.doesNotMatch(texto, /Ferramenta individual/i);
  assert.doesNotMatch(texto, /(?:outras|demais) ferramentas[^.]{0,40}(?:só|apenas|sempre|nunca)/i);
});
