// Texto visível das superfícies comerciais, para os testes de governança de claims (test/claims-lp.test.js).
// Superfícies: a página de vendas e a página de entrada de cada empresa, com os textos padrão que a alimentam
// (landing.js, modelo da landing e avisos de privacidade padrão). Nada aqui é regra: só extração de texto.
import { readFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url).pathname;
export const ler = p => readFileSync(raiz + p, 'utf8');

const ENTIDADES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const entidades = t => t.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, e => ENTIDADES[e]);
// Espaços colapsados; toda tag vira separador, para "a<b>b</b>" não grudar palavras.
export const normalizar = t => entidades(t).replace(/\s+/g, ' ').replace(/ ([.,;:!?)])/g, '$1').trim();

// HTML: texto dos elementos e dos atributos que chegam a alguém (leitor de tela, busca, compartilhamento).
// Elemento de bloco vira separador " | " (fim de trecho); tag de texto corrido (span, b, small…) vira espaço.
const BLOCO = /<\/?(?:p|li|h[1-6]|div|td|th|tr|summary|figcaption|section|ul|ol|label|option|button|header|footer|nav|figure|details|table|thead|tbody|title|a)\b[^>]*>/gi;
export function textoDeHtml(html) {
  const sem = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ');
  const atributos = [...sem.matchAll(/\b(?:aria-label|alt|title|content)="([^"]*)"/g)].map(m => m[1]).filter(v => /\s/.test(v) && !/=/.test(v));
  const corpo = sem.replace(/<head\b[\s\S]*?<\/head>/i, m => m.replace(/<meta\b[^>]*>/gi, ' ')).replace(BLOCO, ' | ').replace(/<[^>]+>/g, ' ');
  return normalizar([corpo, ...atributos].join(' | ')).replace(/(?:\s*\|\s*)+/g, ' | ');
}

// JS: literais de texto ('...', "...", `...`) de um trecho do arquivo, com tags e interpolações removidas.
export function textoDeJs(trecho) {
  const literais = [...trecho.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
    .map(m => (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, 'empresa').replace(/\\n/g, ' ').replace(/\\(.)/g, '$1'))
    .filter(s => /[a-zà-ú]{3,}\s+[a-zà-ú]{2,}/i.test(s));
  return normalizar(literais.map(s => s.replace(/<[^>]+>/g, ' ')).join(' | '));
}

const entre = (texto, inicio, fim) => {
  const i = texto.indexOf(inicio);
  if (i < 0) throw new Error(`trecho não encontrado: ${inicio}`);
  const j = texto.indexOf(fim, i + inicio.length);
  return texto.slice(i, j < 0 ? undefined : j);
};

// Cada superfície: nome usado no registro (docs/claims-lp.md) → texto visível.
export function superficies() {
  const empresas = ler('src/plataforma/empresas.js');
  return {
    vendas: textoDeHtml(ler('public/vendas.html')),
    entrada: [
      textoDeHtml(ler('public/index.html')),
      textoDeJs(entre(ler('public/landing.js'), 'const PADRAO_CHAMADAS', 'function desenharChamadas')),
      textoDeJs(entre(empresas, 'export const marcaPadrao', 'export const TEXTOS_MARCA')),
      textoDeJs(entre(empresas, 'export function landingPadrao', '\n}\n')),
      textoDeJs(entre(empresas, 'export const seoPadrao', '\n')),
      textoDeJs(ler('src/config.js').split('\n').find(l => l.includes('privacyNote:'))),
    ].join(' | '),
  };
}

// Frases: divididas por pontuação final ou por separador de bloco.
export const frases = texto => texto.split(/(?<=[.!?])\s+|\s*\|\s*/).map(f => f.trim()).filter(Boolean);

// Trechos que precisam de entrada sustentada no registro: falam de dados, segurança, privacidade, custo,
// conferência de resultado ou fornecedores. Palavras comuns ("email", "créditos") ficam fora para não obrigar
// registro de texto operacional.
export const SENSIVEL = /senha|prote[çg]|seguran[çc]a|privad|credencia|chaves? de acesso|sigilos|privacidad|reten[çc][ãa]o|trein|\bteto|limites?\b|isolad|separad|bloque|autorizad|servidor|fornecedor(?:es)? (?:fixad|que declaram)|fornecedor fixado|conferid|conferência (?:automática|do quick win|reduz|incompleta)|conferências automáticas|colegas|por que (?:esta escolha|aquele nível)|vers[ãõ][oe]s? (?:publicad|anterior)|nova versão|apagad|sobrescrit|uso único|fabricante|reserva|ciência|reconhec|antes do envio|registrad[ao] na Atividade|fica registrad|ficam registrad|\bLGPD\b/i;
