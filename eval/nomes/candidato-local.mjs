// Candidato local para a segunda camada (nomes de pessoa em texto livre).
// Não usa modelo nem rede: combina a forma do texto (palavras com inicial
// maiúscula, ou tudo maiúsculo) com listas de prenomes e sobrenomes comuns no
// Brasil. Ainda em avaliação: não está ligado ao filtro (decisão da Fase 2).

const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Prenomes frequentes no Brasil (rankings de nascimentos e do Censo, de memória).
const FIRST = new Set(`
maria ana francisca antonia adriana juliana marcia fernanda patricia aline sandra camila amanda bruna jessica leticia
julia luciana vanessa mariana gabriela vera beatriz carla simone renata cristina daniela larissa raimunda sonia paula
tatiana rosa rita luana natalia claudia rafaela eliane monica debora priscila regina luzia josefa andreia helena carolina
lucia fatima tania isabel alessandra viviane elaine silvia sara lais yasmin isabela sophia alice laura valentina helo
heloisa manuela livia giovanna lara cecilia clara lorena luiza lavinia gisele katia kelly cintia michele denise aparecida
angela marta joana ingrid thais thayna rayane rebeca nicole emanuelly vitoria stefany
jose joao antonio francisco carlos paulo pedro lucas luiz marcos luis gabriel rafael daniel marcelo bruno eduardo felipe
raimundo rodrigo manoel mateus andre fernando fabio leonardo gustavo guilherme leandro tiago thiago anderson ricardo
marcio jorge sebastiao alexandre roberto edson diego vitor sergio claudio matheus joaquim renato vinicius marcio caio
igor julio samuel davi arthur heitor bernardo enzo miguel theo lorenzo noah benicio kaua ryan wesley everton jefferson
cleber reinaldo valdir osvaldo otavio mauro mario hugo henrique murilo otavio emerson alan allan wellington robson
nelson ronaldo rogerio silvio severino benedito geraldo josue elias jonas david erick yuri hiroshi
`.trim().split(/\s+/));

// Sobrenomes frequentes no Brasil.
const LAST = new Set(`
silva santos oliveira souza sousa rodrigues ferreira alves pereira lima gomes costa ribeiro martins carvalho almeida lopes
soares fernandes vieira barbosa rocha dias nascimento andrade moreira nunes marques machado mendes freitas cardoso ramos
goncalves santana teixeira araujo castro pinto moura cavalcanti correia monteiro batista campos rezende melo farias
barros nogueira cunha reis medeiros aguiar borges mota guimaraes coelho pires cruz tavares magalhaes vasconcelos siqueira
queiroz brandao fonseca duarte leite paiva figueiredo couto amaral fontes rangel prado mesquita arruda maciel lacerda
xavier azevedo miranda moraes morais bezerra macedo sales peixoto franco leal caldeira bastos serra pacheco neves
`.trim().split(/\s+/));

const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos']);
// Palavras que indicam lugar, instituição, empresa ou calendário, não pessoa.
const BLOCK = new Set(`
sao santa santo nossa senhora rio porto belo campo grande alegre horizonte catarina janeiro fevereiro marco abril maio
junho julho agosto setembro outubro novembro dezembro segunda terca quarta quinta sexta sabado domingo feira dia
semana banco grupo mercado livre solucoes ambientais diretoria financeira recursos humanos departamento pessoal microsoft
teams power politica uso bom equipe avenida rua rodovia travessa alameda praca parque industrial hospital casa escola
estadual municipal prefeitura tribunal regional trabalho conselho nacional meio ambiente receita federal lei geral
protecao dados anexo tecnico termo referencia relatorio sustentabilidade anual interna prevencao acidentes metalurgica
aco forte pao acucar sistema presidente
`.trim().split(/\s+/));

const WORD = /[A-Za-zÀ-ÖØ-öø-ÿ']+/g;

function shape(w) {
  if (/^[A-ZÀ-ÖØ-Þ][a-zß-öø-ÿ']+$/.test(w)) return 'cap';
  if (/^[A-ZÀ-ÖØ-Þ]{2,}$/.test(w)) return 'upper';
  if (/^[a-zß-öø-ÿ']+$/.test(w)) return 'lower';
  return 'other';
}

// Devolve os nomes encontrados: [{ start, end, text }].
export function findNames(text) {
  const words = [...text.matchAll(WORD)].map(m => ({ w: m[0], p: plain(m[0]), start: m.index, end: m.index + m[0].length, s: shape(m[0]) }));
  const out = [];
  let i = 0;
  while (i < words.length) {
    const first = words[i];
    const nameLike = t => (t.s === 'cap' || t.s === 'upper') || (t.s === 'lower' && (FIRST.has(t.p) || LAST.has(t.p)));
    if (BLOCK.has(first.p) && first.s !== 'lower') {
      // Pula a sequência inteira que começa com palavra de lugar ou instituição.
      let j = i;
      while (j + 1 < words.length && /^[ ]{1,2}$/.test(text.slice(words[j].end, words[j + 1].start))
        && (words[j + 1].s === 'cap' || words[j + 1].s === 'upper' || PARTICLES.has(words[j + 1].p))) j++;
      i = j + 1;
      continue;
    }
    if (!nameLike(first) || PARTICLES.has(first.p)) { i++; continue; }
    // Estende enquanto houver palavras de nome (com partículas no meio), sem quebra de linha.
    let j = i;
    const seq = [first];
    while (j + 1 < words.length) {
      const gap = text.slice(words[j].end, words[j + 1].start);
      if (!/^[ ]{1,2}$/.test(gap)) break;
      const nxt = words[j + 1];
      if (PARTICLES.has(nxt.p) && j + 2 < words.length && nameLike(words[j + 2]) && /^[ ]{1,2}$/.test(text.slice(nxt.end, words[j + 2].start))) {
        seq.push(nxt, words[j + 2]);
        j += 2;
        continue;
      }
      if (!nameLike(nxt) || PARTICLES.has(nxt.p)) break;
      // Minúsculas só continuam uma sequência que começou em minúsculas.
      if (nxt.s === 'lower' && first.s !== 'lower') break;
      if (nxt.s !== 'lower' && first.s === 'lower') break;
      seq.push(nxt);
      j++;
    }
    const core = seq.filter(t => !PARTICLES.has(t.p));
    const ok = core.length >= 2
      && !core.some(t => BLOCK.has(t.p))
      && (FIRST.has(core[0].p) || (core[0].s !== 'lower' && LAST.has(core[core.length - 1].p)))
      && (first.s !== 'lower' || core.every(t => FIRST.has(t.p) || LAST.has(t.p)));
    if (ok) {
      const start = seq[0].start;
      const end = seq[seq.length - 1].end;
      out.push({ start, end, text: text.slice(start, end) });
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}
