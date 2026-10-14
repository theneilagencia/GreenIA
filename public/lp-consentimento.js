// Apenas a LP comercial importa este módulo. Consentimento básico: nenhum SDK do Google antes de aceitar.
import { CAMPOS_ORIGEM, limparOrigem } from '/origem-contato.js';
const form = document.getElementById('form-contato');
const box = document.getElementById('gia-consent');
if (form && box) {
  const AW = 'AW-18400941509', LABEL = 'dMHzCLDLypwdEMWroMZE';
  const KEY = 'greenia_consent_v1', ORIGEM = 'greenia_origem_v1', ENVIADAS = 'greenia_conversoes_v1';
  const ler = (storage, key) => { try { return window[storage].getItem(key); } catch { return null; } };
  const gravar = (storage, key, valor) => { try { window[storage].setItem(key, valor); } catch { /* armazenamento bloqueado não impede o contato */ } };
  const json = valor => { try { return JSON.parse(valor); } catch { return null; } };
  let consentimento = ler('localStorage', KEY);
  if (!['granted', 'denied'].includes(consentimento)) consentimento = null;
  let carregada = false, revisao = 0, devolverFoco = null;
  const anteriores = json(ler('sessionStorage', ENVIADAS));
  const enviadas = new Set(Array.isArray(anteriores) ? anteriores.filter(x => typeof x === 'string').slice(-20) : []);
  const consent = permitido => ({ ad_storage: permitido ? 'granted' : 'denied', ad_user_data: permitido ? 'granted' : 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
  function origemDaVisita() {
    const q = new URLSearchParams(location.search);
    let o = limparOrigem(json(ler('sessionStorage', ORIGEM)) || {});
    if (!Object.keys(o).length || CAMPOS_ORIGEM.slice(0, 8).some(k => q.get(k))) {
      o = {};
      for (const k of CAMPOS_ORIGEM.slice(0, 8)) if (q.get(k)) o[k] = q.get(k);
      o.pagina_entrada = location.pathname;
      try { const r = new URL(document.referrer); if (['http:', 'https:'].includes(r.protocol)) o.referrer = r.origin; } catch { /* sem referência */ }
    }
    if (consentimento !== 'granted') for (const k of ['gclid', 'gbraid', 'wbraid']) delete o[k];
    // Não armazena parâmetros arbitrários nem fragmentos da URL; a referência é limitada à origem.
    try {
      const entrada = new URL(o.pagina_entrada || '/', location.origin);
      const params = new URLSearchParams();
      for (const k of CAMPOS_ORIGEM.slice(0, 8)) if (o[k]) params.set(k, o[k]);
      o.pagina_entrada = entrada.pathname + (params.size ? `?${params}` : '');
    } catch { o.pagina_entrada = '/'; }
    o = limparOrigem(o);
    gravar('sessionStorage', ORIGEM, JSON.stringify(o));
    for (const k of CAMPOS_ORIGEM) {
      let input = form.querySelector(`input[name="${k}"]`);
      if (!input) { input = document.createElement('input'); input.type = 'hidden'; input.name = k; form.append(input); }
      input.value = o[k] || '';
    }
    return o;
  }
  function carregar() {
    if (consentimento !== 'granted' || carregada) return;
    carregada = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', consent(false));
    window.gtag('consent', 'update', consent(true));
    window.gtag('set', 'ads_data_redaction', true);
    window.gtag('js', new Date());
    const o = origemDaVisita();
    window.gtag('config', AW, { allow_enhanced_conversions: true, allow_ad_personalization_signals: false, page_location: location.origin + o.pagina_entrada, page_referrer: o.referrer || '' });
    const script = document.createElement('script');
    script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${AW}`;
    script.onerror = () => { carregada = false; script.remove(); };
    document.head.append(script);
  }
  function limparCookiesPublicidade() {
    const dominios = ['', location.hostname, location.hostname.replace(/^www\./, '')];
    for (const parte of document.cookie.split(';')) {
      const nome = parte.split('=')[0].trim();
      if (!nome.startsWith('_gcl_')) continue;
      for (const dominio of new Set(dominios)) document.cookie = `${nome}=; Max-Age=0; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}${dominio ? `; Domain=${dominio}` : ''}`;
    }
  }
  function abrir(foco = true) {
    devolverFoco = document.activeElement;
    box.hidden = false;
    if (foco) box.querySelector('button').focus({ preventScroll: true });
  }
  window.giaPreferenciasCookies = () => abrir();
  document.getElementById('preferencias-cookies')?.addEventListener('click', ev => { ev.preventDefault(); abrir(); });
  box.addEventListener('click', ev => {
    const botao = ev.target.closest('[data-gia]');
    if (!botao) return;
    consentimento = botao.dataset.gia;
    revisao++;
    gravar('localStorage', KEY, consentimento);
    if (consentimento === 'granted') {
      if (carregada) window.gtag('consent', 'update', consent(true)); else carregar();
    } else {
      if (window.gtag) { window.gtag('set', 'user_data', {}); window.gtag('consent', 'update', consent(false)); }
      limparCookiesPublicidade();
    }
    origemDaVisita();
    box.hidden = true;
    if (devolverFoco?.isConnected) devolverFoco.focus({ preventScroll: true });
  });
  // O sucesso visual também é usado na armadilha anti-spam; só esta confirmação de gravação mede conversão.
  document.addEventListener('greenia:contato-recebido', async ev => {
    const id = ev.detail?.id;
    if (consentimento !== 'granted' || typeof id !== 'string' || !id || id.length > 100 || enviadas.has(id)) return;
    enviadas.add(id);
    gravar('sessionStorage', ENVIADAS, JSON.stringify([...enviadas].slice(-20)));
    const versao = revisao;
    let email = document.getElementById('c-email').value.trim().toLowerCase();
    let hash = null;
    try {
      email = email.replace(/^([^@]+)@(gmail\.com|googlemail\.com)$/, (_, usuario, dominio) => `${usuario.replace(/\./g, '')}@${dominio}`);
      if (email && window.crypto?.subtle) hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)))].map(x => x.toString(16).padStart(2, '0')).join('');
    } catch { /* conversão simples continua disponível sem dados do usuário */ }
    if (consentimento !== 'granted' || revisao !== versao) return;
    carregar();
    window.gtag('set', 'user_data', hash ? { sha256_email_address: hash } : {});
    window.gtag('event', 'conversion', { send_to: `${AW}/${LABEL}`, transaction_id: id });
    window.gtag('set', 'user_data', {});
  });
  origemDaVisita();
  if (consentimento === 'granted') carregar();
  else limparCookiesPublicidade();
  if (consentimento === null || location.hash === '#preferencias-cookies') abrir(false);
}
