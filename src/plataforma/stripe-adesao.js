// Contratação por link direto: verificação do email antes de criar empresa/sessão.
// Nunca concede vínculo numa empresa existente por nome, CNPJ ou domínio informado.
import { randomBytes, createHash } from 'node:crypto';
import { exec, um, todos } from '../db.js';
import { erro } from '../http.js';
import { criarEmpresa, criarMembro, acharUsuario, garantirUsuario, lerEmpresa } from './empresas.js';
import { normEmail, emailValido, enviarCodigo, conferirCodigo, checarCsrf, adicionarCookie, abrirSessao, definirContexto } from './sessao.js';
import { permissoesDaRole } from './rbac.js';
import { slugDe } from './validar.js';
import { salvarFaturamento } from './faturamento.js';
import { ITENS_STRIPE } from './stripe-catalogo.js';
import { planoComercialStripe } from './stripe-compra.js';
import { iniciarDireitosStripeSemPagamento } from './stripe-direitos.js';
import { auditar } from './auditoria.js';

const sha=s=>createHash('sha256').update(s).digest('hex');
const COOKIE='gia_compra', ESCOPO='stripe_adesao_publica';
const texto=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';

export function rotasAdesaoStripe(P,r) {
  P.db.exec(`create table if not exists stripe_adesoes (
    token_hash text primary key, csrf text not null, expira integer not null,
    email text, verificado integer not null default 0, empresa text);
    create table if not exists stripe_adesao_limites (chave text not null, em integer not null);
    create index if not exists stripe_adesao_limites_em on stripe_adesao_limites(em);`);
  function habilitado() {
    if(!P.stripe || P.stripe.env.STRIPE_EMISSOES==='0') throw erro(503,'stripe_indisponivel','A contratação está temporariamente indisponível. Tente novamente mais tarde.');
  }
  function sessao({cookies,req},escrita=true) {
    habilitado();
    const s=um(P.db,'select * from stripe_adesoes where token_hash=?',sha(cookies[COOKIE]||''));
    if(!s || s.expira<P.agora().getTime())throw erro(401,'adesao_expirada','Sua sessão de contratação expirou. Recarregue a página.');
    if(escrita)checarCsrf(s,req);
    return s;
  }
  function verificado(s) {
    if(!s.verificado)throw erro(401,'email_nao_verificado','Confirme o código enviado ao seu email antes de continuar.');
    const u=acharUsuario(P,s.email);
    if(u && u.status!=='ativo')throw erro(403,'acesso_bloqueado','Este acesso está desativado. Fale com a TheNeil.');
    return u;
  }
  function empresas(email) {
    const u=acharUsuario(P,email);if(!u || u.status!=='ativo')return [];
    return todos(P.db,`select c.id,c.name,c.status,cu.role_id from company_users cu join companies c on c.id=cu.company_id
      where cu.user_id=? and cu.status in ('ativo','convidado')`,u.id)
      .map(c=>({id:c.id,nome:c.name,permitido:c.status==='ativa' && permissoesDaRole(P.db,c.role_id).includes('billing.manage')}));
  }
  r.get('/api/adesao',({cookies,res})=>{
    habilitado();
    let s=um(P.db,'select * from stripe_adesoes where token_hash=?',sha(cookies[COOKIE]||''));
    if(!s || s.expira<P.agora().getTime()) {
      const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url'),agora=P.agora().getTime();
      exec(P.db,'delete from stripe_adesoes where expira<?',agora);
      exec(P.db,'insert into stripe_adesoes(token_hash,csrf,expira) values (?,?,?)',sha(token),csrf,agora+3600e3);
      adicionarCookie(res,`${COOKIE}=${token}; HttpOnly${P.cookieSeguro?'; Secure':''}; SameSite=Lax; Path=/; Max-Age=3600`);
      s={csrf,verificado:0};
    }
    res.setHeader('cache-control','no-store');
    return {csrf:s.csrf,verificado:!!s.verificado,email:s.verificado?s.email:undefined,empresas:s.verificado?empresas(s.email):[],disponivel:true};
  },{publica:true});
  r.post('/api/adesao/codigo',async ctx=>{
    const s=sessao(ctx),email=normEmail(ctx.corpo.email);
    if(!emailValido(email))throw erro(400,'email','Informe um email válido.');
    if(ctx.corpo.site)throw erro(400,'pedido_invalido','Não foi possível processar este pedido.');
    const agora=P.agora().getTime(),ip=ctx.origem.ip;
    exec(P.db,'delete from stripe_adesao_limites where em<?',agora-3600e3);
    if(um(P.db,'select count(*) n from stripe_adesao_limites where chave=?',sha(ip)).n>=10)throw erro(429,'muitos_pedidos','Muitos códigos solicitados. Aguarde antes de tentar novamente.');
    exec(P.db,'insert into stripe_adesao_limites values (?,?)',sha(ip),agora);
    // Limite do código é global por email, sem depender da criação de novos cookies.
    await enviarCodigo(P,email,ESCOPO,P.email,'Confirme seu email para contratar o GreenIA');
    exec(P.db,'update stripe_adesoes set email=?,verificado=0,empresa=null where token_hash=?',email,s.token_hash);
    return {ok:true};
  },{publica:true,limiteMb:0.01});
  r.post('/api/adesao/verificar',ctx=>{
    const s=sessao(ctx);
    if(!s.email)throw erro(400,'email','Solicite primeiro um código por email.');
    conferirCodigo(P,s.email,ESCOPO,texto(ctx.corpo.codigo,10));
    verificado({...s,verificado:1});
    exec(P.db,'update stripe_adesoes set verificado=1 where token_hash=?',s.token_hash);
    return {ok:true,empresas:empresas(s.email)};
  },{publica:true,limiteMb:0.01});
  r.post('/api/adesao/empresa',ctx=>{
    const s=sessao(ctx);let u=verificado(s),c;
    const vinculos=empresas(s.email);
    if(s.empresa || ctx.corpo.empresa) {
      const id=ctx.corpo.empresa ? String(ctx.corpo.empresa) : s.empresa;
      if(!vinculos.some(v=>v.id===id && v.permitido))throw erro(403,'sem_permissao','Somente o responsável financeiro desta empresa pode contratar.');
      c=lerEmpresa(P,id);
    } else {
      if(vinculos.length)throw erro(409,'empresa_existente','Seu email já pertence a uma empresa. Use esse ambiente e peça a contratação ao administrador.');
      if(ctx.corpo.confirmar_cadastro!==true)throw erro(400,'confirmacao','Confirme que está autorizado a cadastrar a empresa.');
      const nome=texto(ctx.corpo.nome_empresa,80),responsavel=texto(ctx.corpo.nome,120),documento=texto(ctx.corpo.documento,40);
      if(nome.length<2 || responsavel.length<2)throw erro(400,'cadastro','Informe seu nome e o nome da empresa.');
      const numero=documento.replace(/\D/g,'');
      if(documento && !/^[\p{L}\p{N} ./-]{3,40}$/u.test(documento))throw erro(400,'documento','Documento da empresa inválido.');
      if(numero.length>=11 && todos(P.db,"select document from companies where document!=''").some(x=>x.document.replace(/\D/g,'')===numero))throw erro(409,'empresa_existente','Já existe um cadastro com esse documento. Entre no ambiente existente ou fale com a TheNeil.');
      const item=ITENS_STRIPE.find(i=>i.chave===ctx.corpo.produto && i.recorrente);
      if(!item)throw erro(400,'plano','Escolha um dos planos para iniciar a contratação. Capacity Packs exigem um plano existente.');
      const plano=planoComercialStripe(P,item);
      u=u || garantirUsuario(P,s.email,responsavel);
      const slug=`${slugDe(nome).slice(0,24)||'conta'}-${randomBytes(5).toString('hex')}`;
      c=criarEmpresa(P,{name:nome,legal_name:nome,slug,plan_id:plano.id,status:'ativa',document:documento,contact_email:s.email},u.id,ctx.origem);
      // Fail closed: se o provisionamento falhar, não abrir sessão nem liberar o ambiente.
      try {
        iniciarDireitosStripeSemPagamento(P.tenant(c.id));
        criarMembro(P,c.id,{email:s.email,name:responsavel,role_key:'company_admin',status:'ativo'},u.id,ctx.origem,{convidar:false});
        salvarFaturamento(P,c.id,{forma:'stripe',confirmar_stripe:true},u.id,ctx.origem);
      } catch(e) {exec(P.db,"update companies set status='em_implantacao' where id=?",c.id);throw e;}
      auditar(P,{usuario:u.id,empresa:c.id,acao:'billing.self_service_registered',entidade:'company',id:c.id,depois:{pagamento_pendente:true},origem:ctx.origem});
    }
    exec(P.db,'update stripe_adesoes set empresa=? where token_hash=?',c.id,s.token_hash);
    exec(P.db,"update company_users set status='ativo' where company_id=? and user_id=? and status='convidado'",c.id,u.id);
    definirContexto(P,ctx.res,c.id);
    const csrf=abrirSessao(P,ctx.res,u.id,c.id,'contratacao_email_verificado');
    return {ok:true,csrf,empresa:{id:c.id,nome:c.name}};
  },{publica:true,limiteMb:0.02});
}
