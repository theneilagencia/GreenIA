// Descoberta do site comercial: nunca replica o índice nos domínios das empresas.
import {readFile} from 'node:fs/promises';
const recursos=new Map([['/robots.txt',['robots.txt','text/plain; charset=utf-8']],['/sitemap.xml',['sitemap.xml','application/xml; charset=utf-8']],['/llms.txt',['llms.txt','text/plain; charset=utf-8']]]);
export async function responderDescobertaPublica(req,res,caminho,comercial){
 const recurso=recursos.get(caminho);
 if(!recurso || !['GET','HEAD'].includes(req.method))return false;
 if(!comercial){res.writeHead(404,{'content-type':'text/plain; charset=utf-8','x-robots-tag':'noindex'});res.end('Não encontrado');return true;}
 const dados=await readFile(new URL('../public/'+recurso[0],import.meta.url));
 res.writeHead(200,{'content-type':recurso[1],'cache-control':'public, max-age=300','content-length':dados.length});res.end(req.method==='HEAD'?undefined:dados);return true;
}
export function indexacaoAreaInterna(res,caminho){
 if(/^\/(?:api(?:\/|$)|app(?:\/|$)|entrar(?:\/|$)|encontrar(?:\/|$)|plataforma(?:\/|$)|operador(?:\/|$)|devolucao(?:\/|$))/.test(caminho))res.setHeader('x-robots-tag','noindex, nofollow');
}
