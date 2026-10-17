// Descoberta de integração: lê uma especificação (OpenAPI 3, Swagger 2, introspecção GraphQL ou configuração
// manual) e produz um CANDIDATO de conector, declarativo. A documentação é DADO NÃO CONFIÁVEL: nada nela é executado,
// textos são cortados, $ref só local e com profundidade limitada, tamanho máximo. O candidato não é confiável por
// ser gerado: precisa de teste, política e aprovação antes de ser publicado.
import { classeDaOperacao, efeitosPadrao, classificarRisco, CATEGORIAS } from './riscos.js';

const MAX_SPEC = 1024 * 1024, MAX_OPS = 300;
const corta = (s, n = 300) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const idSeguro = s => corta(s, 80).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || null;

// $ref local ("#/components/schemas/X"), sem ciclos, profundidade limitada.
function resolverRefs(no, raiz, prof = 0, vistos = new Set()) {
  if (prof > 12 || no == null || typeof no !== 'object') return no;
  if (Array.isArray(no)) return no.slice(0, 200).map(x => resolverRefs(x, raiz, prof + 1, vistos));
  if (typeof no.$ref === 'string') {
    if (!no.$ref.startsWith('#/') || vistos.has(no.$ref)) return {};
    const alvo = no.$ref.slice(2).split('/').reduce((o, k) => (o && typeof o === 'object' && !['__proto__', 'constructor', 'prototype'].includes(k) ? o[k.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined), raiz);
    return resolverRefs(alvo || {}, raiz, prof + 1, new Set([...vistos, no.$ref]));
  }
  const out = {};
  for (const [k, v] of Object.entries(no).slice(0, 200)) if (!['__proto__', 'constructor', 'prototype'].includes(k)) out[k] = resolverRefs(v, raiz, prof + 1, vistos);
  return out;
}
// Esquema reduzido ao que o validador entende.
function esquemaLimpo(e, prof = 0) {
  if (!e || typeof e !== 'object' || prof > 10) return null;
  const out = {};
  if (e.type) out.type = [].concat(e.type).map(String).slice(0, 4);
  if (e.nullable === true) out.nullable = true;
  if (Array.isArray(e.required)) out.required = e.required.map(x => corta(x, 80)).slice(0, 100);
  if (Array.isArray(e.enum)) out.enum = e.enum.slice(0, 100).filter(x => ['string', 'number', 'boolean'].includes(typeof x));
  for (const k of ['minLength', 'maxLength', 'minimum', 'maximum']) if (Number.isFinite(e[k])) out[k] = e[k];
  if (typeof e.pattern === 'string' && e.pattern.length <= 200) out.pattern = e.pattern;
  if (e.format) out.format = corta(e.format, 40);
  if (e.properties && typeof e.properties === 'object') out.properties = Object.fromEntries(Object.entries(e.properties).slice(0, 150).map(([k, v]) => [corta(k, 80), esquemaLimpo(v, prof + 1) || {}]));
  if (e.items) out.items = esquemaLimpo(e.items, prof + 1) || {};
  if (e.additionalProperties === false) out.additionalProperties = false;
  return out;
}
// Campos que costumam ser dado pessoal ou financeiro: só para SUGERIR efeitos (a pessoa confirma na aprovação).
const PESSOAL = /^(e?-?mail|cpf|cnpj|rg|phone|telefone|celular|birth|nascimento|address|endereco|endereço|ssn|passport|passaporte|nome_completo|full_?name)$/i;
const FINANCEIRO = /^(amount|valor|price|preco|preço|total|invoice|fatura|payment|pagamento|iban|card|cartao|cartão|bank|banco|tax|imposto|salary|salario|salário)$/i;
function camposDe(e, prof = 0, out = new Set()) {
  if (!e || typeof e !== 'object' || prof > 6) return out;
  for (const [k, v] of Object.entries(e.properties || {})) { out.add(k); camposDe(v, prof + 1, out); }
  if (e.items) camposDe(e.items, prof + 1, out);
  return out;
}
function categoriaDe(metodo, declarada) {
  if (CATEGORIAS.includes(declarada)) return declarada;
  const m = metodo.toUpperCase();
  return m === 'GET' ? 'read_data' : m === 'DELETE' ? 'delete_record' : m === 'POST' ? 'create_record' : 'update_record';
}
const PAGINACAO = { page: 'pagina', limit: 'limite', per_page: 'limite', page_size: 'limite', offset: 'deslocamento', cursor: 'cursor', next: 'cursor', _page: 'pagina', _limit: 'limite' };

function operacao({ metodo, caminho, op, raiz, parametrosComuns = [], versao }) {
  const o = resolverRefs(op, raiz);
  const params = [...parametrosComuns, ...(Array.isArray(o.parameters) ? o.parameters : [])].map(p => resolverRefs(p, raiz)).filter(p => p && p.name && p.in);
  const parametros = params.slice(0, 60).map(p => ({ nome: corta(p.name, 80), em: ['path', 'query', 'header'].includes(p.in) ? p.in : null, obrigatorio: p.in === 'path' || p.required === true, esquema: esquemaLimpo(p.schema || p) }))
    .filter(p => p.em && !/^(authorization|cookie)$/i.test(p.nome));
  let corpo = null;
  if (versao === 3) corpo = esquemaLimpo(resolverRefs(o.requestBody?.content?.['application/json']?.schema, raiz));
  else { const b = params.find(p => p.in === 'body'); corpo = b ? esquemaLimpo(resolverRefs(b.schema, raiz)) : null; }
  const respostas = o.responses || {};
  const cod = ['200', '201', '202', 'default'].find(c => respostas[c]);
  const resp = cod ? resolverRefs(respostas[cod], raiz) : null;
  const resposta = versao === 3 ? esquemaLimpo(resp?.content?.['application/json']?.schema) : esquemaLimpo(resp?.schema);
  const classe = classeDaOperacao(metodo, o['x-greenia-classe']);
  const categoria = categoriaDe(metodo, o['x-greenia-categoria']);
  const campos = new Set([...camposDe(corpo), ...camposDe(resposta), ...parametros.map(p => p.nome)]);
  const declarados = o['x-greenia-efeitos'] && typeof o['x-greenia-efeitos'] === 'object' ? o['x-greenia-efeitos'] : {};
  const efeitos = efeitosPadrao({ classe, categoria, declarados: {
    ...([...campos].some(c => PESSOAL.test(c)) ? { personal_data: true } : {}), ...([...campos].some(c => FINANCEIRO.test(c)) ? { financial: true } : {}), ...declarados } });
  const paginacao = parametros.filter(p => p.em === 'query' && PAGINACAO[p.nome.toLowerCase()]).map(p => ({ parametro: p.nome, papel: PAGINACAO[p.nome.toLowerCase()] }));
  return {
    operation_id: idSeguro(o.operationId) || idSeguro(`${metodo}_${caminho}`), metodo: metodo.toUpperCase(), caminho: corta(caminho, 300),
    resumo: corta(o.summary || o.description || '', 200), parametros, request_schema: corpo, response_schema: resposta,
    paginacao: paginacao.length ? paginacao : null, classe, categoria, efeitos,
    idempotente: classe === 'SAFE_READ' || ['PUT', 'DELETE'].includes(metodo.toUpperCase()) || parametros.some(p => /^idempotency-key$/i.test(p.nome)),
    risco: classificarRisco({ efeitos, classe }),
  };
}

function authDe(esquemas = {}, versao) {
  const out = [];
  for (const [nome, s0] of Object.entries(esquemas).slice(0, 10)) {
    const s = s0 || {};
    if (s.type === 'apiKey') out.push(s.in === 'header' ? { nome: corta(nome, 60), tipo: 'api_key', cabecalho: corta(s.name, 64) } : { nome: corta(nome, 60), tipo: 'nao_suportado', motivo: 'Chave na URL ou em cookie não é aceita: credencial nunca vai no endereço.' });
    else if ((s.type === 'http' && /^bearer$/i.test(s.scheme)) || (versao === 2 && s.type === 'apiKey' && /authorization/i.test(s.name))) out.push({ nome: corta(nome, 60), tipo: 'bearer' });
    else if ((s.type === 'http' && /^basic$/i.test(s.scheme)) || s.type === 'basic') out.push({ nome: corta(nome, 60), tipo: 'basic' });
    else if (s.type === 'oauth2') {
      const f = s.flows || {};
      if (f.clientCredentials || s.flow === 'application') { const x = f.clientCredentials || s; out.push({ nome: corta(nome, 60), tipo: 'oauth2_client_credentials', token_url: corta(x.tokenUrl, 300), scopes: Object.keys(x.scopes || {}).slice(0, 50) }); }
      if (f.authorizationCode || s.flow === 'accessCode') { const x = f.authorizationCode || s; out.push({ nome: corta(nome, 60), tipo: 'oauth2_authorization_code', auth_url: corta(x.authorizationUrl, 300), token_url: corta(x.tokenUrl, 300), scopes: Object.keys(x.scopes || {}).slice(0, 50) }); }
    }
  }
  return out;
}

// Entrada: objeto JSON (ou texto JSON). Devolve { formato, sistema, base_url, hosts, auth, operacoes, avisos }.
export function descobrir(entrada) {
  let d = entrada;
  if (typeof d === 'string') { if (d.length > MAX_SPEC) throw new Error('Especificação grande demais (máximo 1 MB).'); try { d = JSON.parse(d); } catch { throw new Error('A especificação precisa estar em JSON (OpenAPI/Swagger, introspecção GraphQL ou configuração manual).'); } }
  if (!d || typeof d !== 'object') throw new Error('Especificação vazia.');
  if (JSON.stringify(d).length > MAX_SPEC) throw new Error('Especificação grande demais (máximo 1 MB).');
  const avisos = [];
  // OpenAPI 3 / Swagger 2
  if (typeof d.openapi === 'string' || d.swagger === '2.0') {
    const versao = d.swagger === '2.0' ? 2 : 3;
    const base = versao === 3 ? corta(d.servers?.[0]?.url, 300) : d.host ? `${(d.schemes || ['https']).includes('https') ? 'https' : d.schemes[0]}://${corta(d.host, 200)}${corta(d.basePath || '', 200)}` : '';
    const operacoes = [];
    for (const [caminho, item] of Object.entries(d.paths || {})) {
      if (operacoes.length >= MAX_OPS) { avisos.push('Especificação com operações demais: só as primeiras entraram.'); break; }
      const comuns = Array.isArray(item?.parameters) ? item.parameters : [];
      for (const m of ['get', 'post', 'put', 'patch', 'delete']) if (item?.[m]) operacoes.push(operacao({ metodo: m, caminho, op: item[m], raiz: d, parametrosComuns: comuns, versao }));
    }
    const auth = authDe(versao === 3 ? d.components?.securitySchemes : d.securityDefinitions, versao);
    return { formato: versao === 3 ? 'openapi3' : 'swagger2', sistema: corta(d.info?.title || 'Sistema externo', 80), base_url: base, hosts: hostDe(base), auth, operacoes: unicos(operacoes), avisos };
  }
  // Introspecção GraphQL: consultas leem, mutações escrevem (uma operação POST por campo).
  const esquema = d.data?.__schema || d.__schema;
  if (esquema) {
    const tipos = new Map((esquema.types || []).map(t => [t.name, t]));
    const ops = [];
    for (const [raizNome, classe] of [[esquema.queryType?.name, 'SAFE_READ'], [esquema.mutationType?.name, 'SIDE_EFFECT']]) {
      for (const f of (tipos.get(raizNome)?.fields || []).slice(0, MAX_OPS)) {
        const categoria = classe === 'SAFE_READ' ? 'read_data' : /^(delete|remove|destroy)/i.test(f.name) ? 'delete_record' : /^(update|edit|set)/i.test(f.name) ? 'update_record' : 'create_record';
        const c2 = categoria === 'delete_record' ? 'DESTRUCTIVE' : classe;
        const efeitos = efeitosPadrao({ classe: c2, categoria });
        ops.push({ operation_id: idSeguro(f.name), metodo: 'POST', caminho: '', graphql: { tipo: classe === 'SAFE_READ' ? 'query' : 'mutation', campo: corta(f.name, 80) }, resumo: corta(f.description, 200),
          parametros: (f.args || []).slice(0, 40).map(a => ({ nome: corta(a.name, 80), em: 'variavel', obrigatorio: a.type?.kind === 'NON_NULL' })), request_schema: null, response_schema: null,
          paginacao: null, classe: c2, categoria, efeitos, idempotente: classe === 'SAFE_READ', risco: classificarRisco({ efeitos, classe: c2 }) });
      }
    }
    return { formato: 'graphql', sistema: 'API GraphQL', base_url: '', hosts: [], auth: [], operacoes: unicos(ops), avisos: ['Informe o endereço do endpoint GraphQL.'] };
  }
  // Configuração manual: { sistema, base_url, operacoes: [{ operation_id, metodo, caminho, ... }] }
  if (Array.isArray(d.operacoes)) {
    const ops = d.operacoes.slice(0, MAX_OPS).map(o => operacao({ metodo: String(o.metodo || 'GET').toLowerCase(), caminho: String(o.caminho || '/'), raiz: {}, versao: 3,
      op: { operationId: o.operation_id, summary: o.resumo, parameters: (o.parametros || []).map(p => ({ name: p.nome, in: p.em, required: !!p.obrigatorio, schema: p.esquema })),
        requestBody: o.request_schema ? { content: { 'application/json': { schema: o.request_schema } } } : undefined,
        responses: o.response_schema ? { 200: { content: { 'application/json': { schema: o.response_schema } } } } : {},
        'x-greenia-classe': o.classe, 'x-greenia-categoria': o.categoria, 'x-greenia-efeitos': o.efeitos } }));
    return { formato: 'manual', sistema: corta(d.sistema || 'Sistema externo', 80), base_url: corta(d.base_url, 300), hosts: hostDe(d.base_url), auth: [], operacoes: unicos(ops), avisos };
  }
  throw new Error('Formato não reconhecido: envie OpenAPI 3, Swagger 2, introspecção GraphQL ou a configuração manual.');
}
const unicos = ops => { const vistos = new Set(); return ops.filter(o => o.operation_id && !vistos.has(o.operation_id) && vistos.add(o.operation_id)); };
function hostDe(url) { try { return url ? [new URL(url).hostname.toLowerCase()] : []; } catch { return []; } }
