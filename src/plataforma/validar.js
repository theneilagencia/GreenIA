// Validações do painel da plataforma e do admin da empresa: slug, domínio, cores, imagens, textos e links.
import { erro } from '../http.js';
import { contraste } from '../admin.js';

// Slugs que não podem virar empresa: rotas da aplicação, nomes da plataforma e termos genéricos.
export const SLUGS_RESERVADOS = new Set(['www', 'app', 'api', 'admin', 'administrador', 'plataforma', 'platform', 'entrar', 'encontrar', 'login', 'sair', 'logout',
  'politica', 'operador', 'vendas', 'assets', 'static', 'public', 'cdn', 'mail', 'email', 'smtp', 'suporte', 'support', 'ajuda', 'help', 'status',
  'docs', 'blog', 'dev', 'teste', 'test', 'staging', 'root', 'sistema', 'system', 'conta', 'contas', 'billing', 'pagamento', 'greenia', 'empresa', 'empresas']);

export function validarSlug(slug, reservadosExtra = []) {
  const s = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(s) || s.includes('--')) throw erro(400, 'slug', 'Use de 3 a 40 letras minúsculas, números ou hífens, sem começar ou terminar com hífen.');
  if (SLUGS_RESERVADOS.has(s) || reservadosExtra.includes(s)) throw erro(400, 'slug', 'Este identificador é reservado. Escolha outro.');
  return s;
}

export const slugDe = nome => String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function validarDominio(d) {
  const s = String(d || '').trim().toLowerCase().replace(/\.$/, '');
  if (!s) return null;
  if (s.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s)) throw erro(400, 'dominio', 'Domínio inválido. Exemplo: app.suaempresa.com.br');
  return s;
}

export function validarCor(c, campo = 'cor') {
  const s = String(c || '').trim();
  if (!s) return '';
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw erro(400, campo, 'Cor inválida. Use o formato #RRGGBB.');
  return s.toUpperCase();
}
// A cor principal vira fundo de botão com texto claro e texto sobre fundo claro: mínimo 4,5:1.
export function validarCorPrincipal(c) {
  const s = validarCor(c, 'primary_color');
  if (s && contraste(s, '#F1F1EE') < 4.5) throw erro(400, 'primary_color', `Contraste de ${contraste(s, '#F1F1EE').toFixed(2)}:1 com os fundos claros. O mínimo é 4,5:1: escolha uma cor mais escura.`);
  return s;
}

const IMAGENS = {
  logo: [/^data:image\/(png|svg\+xml|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 300_000, 'O logo precisa ser PNG, JPG, WEBP ou SVG, com até 200 KB.'],
  favicon: [/^data:image\/(png|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/, 120_000, 'O favicon precisa ser PNG, SVG ou ICO, com até 80 KB.'],
  imagem: [/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 1_100_000, 'A imagem precisa ser PNG, JPG ou WEBP, com até 800 KB.'],
};
export function validarImagem(v, tipo) {
  if (!v) return '';
  const [re, max, msg] = IMAGENS[tipo];
  if (typeof v !== 'string' || !re.test(v) || v.length > max) throw erro(400, tipo, msg);
  return v;
}

export const texto = (v, max, campo, { obrigatorio = false } = {}) => {
  const s = String(v ?? '').trim().slice(0, max);
  if (obrigatorio && !s) throw erro(400, campo, 'Campo obrigatório.');
  return s;
};

// Links da landing: http(s), âncora na própria página ou caminho interno. Nada de javascript: ou data:.
export function validarLink(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^(https?:\/\/[^\s<>"]+|#[\w-]*|\/[\w\-./#?=&]*|mailto:[^\s<>"]+)$/i.test(s)) return s.slice(0, 500);
  throw erro(400, 'link', `Link inválido: ${s.slice(0, 60)}. Use https://, /caminho, #secao ou mailto:.`);
}

export function validarEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(s)) throw erro(400, 'email', 'Email inválido.');
  return s;
}
