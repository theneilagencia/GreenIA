// Metadados derivados exclusivamente do conteúdo público; sem dados de tenants.
import { readFile, writeFile } from 'node:fs/promises';
const publico = new URL('../public/', import.meta.url);
const origem = 'https://www.greenia.com.br';
const texto = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim().replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const ancora = t => 'pergunta-' + texto(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
const entidade = {'@type':'Organization','@id':origem+'/#theneil',name:'TheNeil',url:'https://www.theneil.com.br',logo:origem+'/assets/theneil-logo.png'};
const produto = {'@type':'WebApplication','@id':origem+'/#greenia',name:'GreenIA',url:origem+'/',applicationCategory:'BusinessApplication',operatingSystem:'Web',inLanguage:'pt-BR',description:'Plataforma de IA da TheNeil para conversas, documentos, conhecimento da empresa e Quick Wins, com gestão de acessos e consumo de créditos.',provider:{'@id':entidade['@id']}};
const website = {'@type':'WebSite','@id':origem+'/#website',url:origem+'/',name:'GreenIA',inLanguage:'pt-BR',publisher:{'@id':entidade['@id']}};
for(const arquivo of ['vendas.html','faq.html']){
 let html=await readFile(new URL(arquivo,publico),'utf8');
 html=html.replace(/<!-- SEO-PUBLICO:INICIO -->[\s\S]*?<!-- SEO-PUBLICO:FIM -->\n?/g,'');
 const faq=arquivo==='faq.html',url=origem+(faq?'/faq.html':'/');
 const titulo=faq?'Perguntas frequentes | GreenIA':'GreenIA | IA para empresas com sigilo e controle de custos';
 const descricao=faq?'Respostas sobre a GreenIA: Quick Wins, créditos, dados da empresa, agendamentos e projetos com a TheNeil.':'Reúna conversas, documentos e Quick Wins em uma plataforma de IA para a empresa, com regras para dados, acessos e consumo de créditos.';
 // Mantém uma única descrição e as demais tags sociais em um bloco administrável.
 html=html.replace(/<meta (?:name="description"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\n?/g,'');
 if(faq) html=html.replace(/<details name="greenia-faq"[^>]*><summary>([\s\S]*?)<\/summary>/g, (_,q) => `<details name="greenia-faq" id="${ancora(q)}"><summary>${q}</summary>`);
 const perguntas=[...html.matchAll(/<details name="greenia-faq"[^>]*><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map(m=>({'@type':'Question','@id':url+'#'+ancora(m[1]),url:url+'#'+ancora(m[1]),name:texto(m[1]),acceptedAnswer:{'@type':'Answer',text:texto(m[2])}}));
 const pagina={'@type':faq?'FAQPage':'WebPage','@id':url+'#pagina',url,name:titulo,description:descricao,inLanguage:'pt-BR',isPartOf:{'@id':website['@id']},about:{'@id':produto['@id']},publisher:{'@id':entidade['@id']},...(faq?{mainEntity:perguntas}:{mainEntity:{'@id':produto['@id']}})};
 const grafo=[entidade,website,produto,pagina];
 if(faq)grafo.push({'@type':'BreadcrumbList','@id':url+'#caminho',itemListElement:[{'@type':'ListItem',position:1,name:'GreenIA',item:origem+'/'},{'@type':'ListItem',position:2,name:'Perguntas frequentes',item:url}]});
 const imagem=origem+'/assets/greenia-social.png';
 const bloco=`<!-- SEO-PUBLICO:INICIO -->
<link rel="canonical" href="${url}">
<meta name="description" content="${descricao}">
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="GreenIA">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${descricao}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${imagem}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="GreenIA, plataforma de IA da TheNeil para empresas">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:description" content="${descricao}">
<meta name="twitter:image" content="${imagem}">
<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':grafo}).replace(/</g,'\\u003c')}</script>
<!-- SEO-PUBLICO:FIM -->\n`;
 html=html.replace('</head>',bloco+'</head>');
 await writeFile(new URL(arquivo,publico),html);
}
