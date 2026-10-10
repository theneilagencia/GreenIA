import { E } from '/app.js';
import { toast } from '/comum.js';
const memoria=new Map();
const chave=nome=>`greenia-visao-v1:${E.plataforma?.empresa?.id??'local'}:${E.eu?.id}:${nome}`;
export function lerVisao(nome) {try{return JSON.parse(localStorage.getItem(chave(nome))||'null')||memoria.get(chave(nome));}catch{return memoria.get(chave(nome));}}
export function salvarVisao(nome,valor) {memoria.set(chave(nome),valor);try{localStorage.setItem(chave(nome),JSON.stringify(valor));toast('Filtros salvos neste navegador.');}catch{toast('Filtros guardados durante esta sessão.');}}
export function ligarVisao(nome,host,ler,aplicar) {
 if(!host||host.querySelector('[data-visao-salvar]'))return;
 const faixa=document.createElement('div');faixa.className='linha-botoes visoes-salvas';
 faixa.innerHTML='<button type="button" class="btn-texto" data-visao-salvar>Salvar filtros</button><button type="button" class="btn-texto" data-visao-aplicar>Aplicar filtros salvos</button><span class="dica">Só neste navegador e nesta conta</span>';
 host.append(faixa);faixa.querySelector('[data-visao-salvar]').onclick=()=>salvarVisao(nome,ler());
 faixa.querySelector('[data-visao-aplicar]').onclick=()=>{const v=lerVisao(nome);if(v)aplicar(v);else toast('Salve uma combinação de filtros primeiro.');};
}
