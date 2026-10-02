// Rede segura do runtime de conectores: toda chamada externa de integração passa por aqui (nunca fetch direto).
//
// Proteções (SSRF e afins):
// - só http(s); https por padrão (http só com a rede privada autorizada pela empresa, para servidor interno);
// - só hosts da allowlist do conector (comparação exata, sem curinga implícito);
// - o nome é resolvido aqui e TODOS os endereços são conferidos: loopback, rede privada (RFC 1918), link-local,
//   metadados de nuvem (169.254.169.254 e afins), CGNAT, multicast, reservados, IPv6 local/único/mapeado;
// - a conexão vai para o IP conferido (lookup fixado): DNS rebinding não troca o destino entre a conferência e a conexão;
// - redirecionamento só para host da allowlist, conferido de novo a cada salto (máximo 3);
// - tempo limite obrigatório, tamanho máximo de resposta, cabeçalhos sem quebra de linha (header injection).
// Rede privada só quando a configuração corporativa autoriza (redePrivada: true) — e mesmo assim nunca metadados.
import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class ErroRede extends Error {
  constructor(codigo, mensagem, extra = {}) { super(mensagem); this.codigo = codigo; Object.assign(this, extra); }
}

// ---- Endereços ------------------------------------------------------------------------------------------------
const v4 = ip => ip.split('.').map(Number);
function bloqueioV4(ip) {
  const [a, b, c] = v4(ip);
  if (a === 0) return 'reservado';
  if (a === 127) return 'loopback';
  if (a === 169 && b === 254) return 'metadados_ou_link_local';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'privado';
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat';
  if (a === 192 && b === 0 && c === 0) return 'reservado';
  if (a === 192 && b === 0 && c === 2) return 'documentacao';
  if (a === 198 && (b === 18 || b === 19)) return 'reservado';
  if (a >= 224) return 'multicast_ou_reservado';
  return null;
}
function expandirV6(ip) {
  let s = ip.toLowerCase().split('%')[0];
  if (s.includes('.')) { const i = s.lastIndexOf(':'); const p = v4(s.slice(i + 1)); s = `${s.slice(0, i)}:${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`; }
  const [a, b = ''] = s.split('::');
  const ini = a ? a.split(':') : [], fim = b ? b.split(':') : [];
  const meio = s.includes('::') ? Array(8 - ini.length - fim.length).fill('0') : [];
  return [...ini, ...meio, ...fim].map(x => parseInt(x || '0', 16));
}
function bloqueioV6(ip) {
  const g = expandirV6(ip);
  if (g.every(x => x === 0)) return 'reservado';
  if (g.slice(0, 7).every(x => x === 0) && g[7] === 1) return 'loopback';
  // IPv4 mapeado (::ffff:a.b.c.d) ou compatível: vale a regra do IPv4.
  if (g.slice(0, 5).every(x => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const ip4 = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
    return bloqueioV4(ip4) || (g[5] === 0 ? 'reservado' : null);
  }
  if (g[0] === 0xfd00 && g[1] === 0x0ec2) return 'metadados_ou_link_local';   // metadados AWS IPv6 (fd00:ec2::/32), antes da faixa privada
  if ((g[0] & 0xfe00) === 0xfc00) return 'privado';   // fc00::/7 (ULA)
  if ((g[0] & 0xffc0) === 0xfe80) return 'metadados_ou_link_local';   // fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return 'multicast_ou_reservado';
  if (g[0] === 0x2001 && g[1] === 0x0db8) return 'documentacao';
  return null;
}
// Motivo do bloqueio de um IP (null = público). Metadados nunca são liberados, nem com rede privada autorizada.
export function motivoBloqueioIp(ip, { redePrivada = false } = {}) {
  const tipo = isIP(ip);
  if (!tipo) return 'ip_invalido';
  const m = tipo === 4 ? bloqueioV4(ip) : bloqueioV6(ip);
  if (!m) return null;
  if (redePrivada && ['privado', 'loopback', 'cgnat'].includes(m)) return null;
  return m;
}

// ---- URL e cabeçalhos -------------------------------------------------------------------------------------------
const HOST_VALIDO = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
// Host canônico: minúsculas, sem ponto final; IPv6 na forma do parser de URL (assim a allowlist e a conferência
// enxergam o mesmo endereço, ex.: ::ffff:127.0.0.1 -> ::ffff:7f00:1).
export function normalizarHost(h) {
  const s = String(h || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(s) === 6) { try { return new URL(`http://[${s}]/`).hostname.replace(/^\[|\]$/g, ''); } catch { return s; } }
  return s;
}
export function conferirUrl(url, { hosts = [], redePrivada = false } = {}) {
  let u;
  try { u = new URL(url); } catch { throw new ErroRede('url_invalida', 'Endereço inválido.'); }
  if (!['https:', 'http:'].includes(u.protocol)) throw new ErroRede('protocolo', 'Só https é aceito.');
  if (u.protocol === 'http:' && !redePrivada) throw new ErroRede('protocolo', 'Só https é aceito (http só para rede interna autorizada).');
  if (u.username || u.password) throw new ErroRede('credencial_na_url', 'Credenciais não podem ir no endereço.');
  const host = normalizarHost(u.hostname.replace(/^\[|\]$/g, ''));
  if (!isIP(host) && !HOST_VALIDO.test(host)) throw new ErroRede('host_invalido', 'Host inválido.');
  if (!hosts.map(normalizarHost).includes(host)) throw new ErroRede('host_nao_autorizado', `Host fora da lista autorizada do conector: ${host}.`, { host });
  if (isIP(host)) { const m = motivoBloqueioIp(host, { redePrivada }); if (m) throw new ErroRede('destino_bloqueado', `Destino bloqueado (${m}).`, { motivo: m }); }
  return { u, host };
}
const CABECALHO_NOME = /^[!#$%&'*+.^_`|~0-9a-z-]{1,64}$/i;
const PROIBIDOS = new Set(['host', 'content-length', 'transfer-encoding', 'connection', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'proxy-connection', 'expect', 'keep-alive']);
export function conferirCabecalhos(h = {}) {
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined || v === null) continue;
    if (!CABECALHO_NOME.test(k) || PROIBIDOS.has(k.toLowerCase())) throw new ErroRede('cabecalho_invalido', `Cabeçalho não permitido: ${String(k).slice(0, 40)}.`);
    const s = String(v);
    if (/[\r\n\0]/.test(s) || s.length > 8192) throw new ErroRede('cabecalho_invalido', 'Valor de cabeçalho inválido.');
    out[k] = s;
  }
  return out;
}

// ---- Chamada --------------------------------------------------------------------------------------------------
// Resolve o host e confere cada endereço; devolve o primeiro IP liberado (a conexão vai fixada nele).
async function resolver(host, { redePrivada, lookup }) {
  if (isIP(host)) return { address: host, family: isIP(host) };
  let lista;
  try { lista = await lookup(host, { all: true, verbatim: true }); } catch { throw new ErroRede('dns', 'Não foi possível resolver o endereço.'); }
  if (!lista?.length) throw new ErroRede('dns', 'Endereço sem IP.');
  for (const a of lista) { const m = motivoBloqueioIp(a.address, { redePrivada }); if (m) throw new ErroRede('destino_bloqueado', `Destino bloqueado (${m}).`, { motivo: m }); }
  return lista[0];
}
function umaRequisicao({ u, ip, metodo, cabecalhos, corpo, tempo, maxBytes }) {
  return new Promise((ok, falha) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      protocol: u.protocol, hostname: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined, path: `${u.pathname}${u.search}`, method: metodo,
      headers: { ...cabecalhos, ...(corpo != null ? { 'content-length': Buffer.byteLength(corpo) } : {}) },
      // DNS fixado: a conexão vai para o IP já conferido (o nome continua no Host e no SNI).
      lookup: (_h, op, cb) => (op?.all ? cb(null, [{ address: ip.address, family: ip.family }]) : cb(null, ip.address, ip.family)),
      timeout: tempo, agent: false,
    }, res => {
      const partes = []; let n = 0;
      res.on('data', d => { n += d.length; if (n > maxBytes) { req.destroy(); falha(new ErroRede('resposta_grande', 'Resposta maior que o limite.')); } else partes.push(d); });
      res.on('end', () => ok({ status: res.statusCode, cabecalhos: res.headers, corpo: Buffer.concat(partes), bytes: n }));
      res.on('error', () => falha(new ErroRede('conexao', 'A conexão caiu durante a resposta.')));
    });
    const relogio = setTimeout(() => { req.destroy(); falha(new ErroRede('tempo_esgotado', 'O sistema externo não respondeu a tempo.')); }, tempo);
    req.on('timeout', () => { req.destroy(); falha(new ErroRede('tempo_esgotado', 'O sistema externo não respondeu a tempo.')); });
    req.on('error', e => falha(e instanceof ErroRede ? e : new ErroRede('conexao', 'Falha de conexão com o sistema externo.')));
    req.on('close', () => clearTimeout(relogio));
    if (corpo != null) req.write(corpo);
    req.end();
  });
}

// buscaSegura({ url, metodo, cabecalhos, corpo, hosts, redePrivada, tempoMs, maxBytes, maxRedirecionamentos, lookup })
export async function buscaSegura({ url, metodo = 'GET', cabecalhos = {}, corpo = null, hosts = [], redePrivada = false, tempoMs, maxBytes = 2 * 1024 * 1024,
  maxRedirecionamentos = 3, lookup = dnsLookup, sensiveis = ['authorization'] } = {}) {
  if (!Number.isFinite(tempoMs) || tempoMs <= 0 || tempoMs > 60_000) throw new ErroRede('tempo_obrigatorio', 'Toda chamada externa precisa de tempo limite (até 60 s).');
  if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD)$/.test(metodo)) throw new ErroRede('metodo', 'Método não permitido.');
  let hs = conferirCabecalhos(cabecalhos);
  let atual = url, m = metodo, c = corpo, hostInicial = null;
  for (let salto = 0; ; salto++) {
    const { u, host } = conferirUrl(atual, { hosts, redePrivada });
    // Credencial não segue para outro host (mesmo da allowlist): o cabeçalho de autenticação cai no salto.
    if (hostInicial === null) hostInicial = host;
    else if (host !== hostInicial) { const fora = new Set(sensiveis.map(x => x.toLowerCase())); hs = Object.fromEntries(Object.entries(hs).filter(([k]) => !fora.has(k.toLowerCase()))); }
    const ip = await resolver(host, { redePrivada, lookup });
    const r = await umaRequisicao({ u, ip, metodo: m, cabecalhos: hs, corpo: c, tempo: tempoMs, maxBytes });
    if (r.status >= 300 && r.status < 400 && r.cabecalhos.location) {
      if (salto >= maxRedirecionamentos) throw new ErroRede('redirecionamentos', 'Redirecionamentos demais.');
      let prox; try { prox = new URL(r.cabecalhos.location, u).toString(); } catch { throw new ErroRede('redirecionamento_invalido', 'Redirecionamento inválido.'); }
      // O próximo salto passa pelas mesmas conferências (allowlist e IP). Corpo só segue em 307/308.
      atual = prox;
      if (![307, 308].includes(r.status)) { m = m === 'HEAD' ? 'HEAD' : 'GET'; c = null; }
      continue;
    }
    return { ...r, url: atual, redirecionamentos: salto };
  }
}
