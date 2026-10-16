// Arquivos do Office a partir de uma resposta: Word (.docx), PowerPoint (.pptx) e Excel (.xlsx). Gerados no servidor,
// sem biblioteca nem serviço externo e sem IA (o conteúdo é o texto da resposta, já guardado). Texto editável: títulos,
// listas e tabelas viram estruturas nativas do Office, não imagem. Na planilha, número, valor em reais, porcentagem e
// data viram valores de verdade (dá para somar e filtrar); o resto fica como texto, inclusive códigos com zero à
// esquerda e documentos longos (CPF, CNPJ), que perderiam dígitos como número.
import { crc32, deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { ajustarContraste, corValida, misturar } from './visual/marca.js';
import { juntarLetrasEspacadas } from './escrita.js';

const VERDE_PADRAO = '1B7950', TINTA = '1F2A24', SUAVE = '5B6B62';
// Cor principal dos arquivos: a da identidade visual da empresa quando há uma, legível sobre o branco (títulos);
// o fundo do cabeçalho das tabelas é um tom bem claro dela.
const paleta = cor => {
  const c = corValida(cor);
  const principal = c ? ajustarContraste(c, '#FFFFFF', 4.5).slice(1) : VERDE_PADRAO;
  return { VERDE: principal, FUNDO_CAB: misturar(`#${principal}`, '#FFFFFF', 0.88).slice(1) };
};

// ---------- ZIP (deflate) ----------
// Data fixa nos cabeçalhos (01/01/2026): o mesmo conteúdo gera os mesmos bytes.
const DOS_DATA = ((2026 - 1980) << 9) | (1 << 5) | 1;
export function zipar(arquivos) {
  const partes = [], central = [];
  let pos = 0;
  for (const { nome, dados: bruto } of arquivos) {
    const dados = Buffer.isBuffer(bruto) ? bruto : Buffer.from(bruto, 'utf8');
    const n = Buffer.from(nome, 'utf8'), c = crc32(dados), comp = deflateRawSync(dados, { level: 9 });
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(DOS_DATA, 12);
    h.writeUInt32LE(c, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(dados.length, 22); h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
    partes.push(h, n, comp);
    const d = Buffer.alloc(46);
    d.writeUInt32LE(0x02014b50, 0); d.writeUInt16LE(20, 4); d.writeUInt16LE(20, 6); d.writeUInt16LE(0x0800, 8); d.writeUInt16LE(8, 10); d.writeUInt16LE(0, 12); d.writeUInt16LE(DOS_DATA, 14);
    d.writeUInt32LE(c, 16); d.writeUInt32LE(comp.length, 20); d.writeUInt32LE(dados.length, 24); d.writeUInt16LE(n.length, 28); d.writeUInt32LE(pos, 42);
    central.push(d, n);
    pos += 30 + n.length + comp.length;
  }
  const tc = Buffer.concat(central), fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10); fim.writeUInt32LE(tc.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...partes, tc, fim]);
}

// ---------- texto da resposta -> blocos ----------
// Mesmas regras do markdown da tela (public/md.js): títulos, listas (com checklist), tabelas, código e parágrafos.
const celulas = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const ehTabela = (l, prox) => /^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(prox || '');
const ITEM = /^\s*([-*]|\d+[.)])\s+/;

// Trechos com negrito, itálico e código em linha: [{ t, b, i, c }].
export function trechos(s) {
  const out = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|(^|[^*])\*([^*\s][^*]*)\*/g;
  let ultimo = 0, m;
  const texto = String(s ?? '');
  while ((m = re.exec(texto))) {
    let ini = m.index;
    if (m[3] !== undefined) { ini += m[3].length; }
    if (ini > ultimo) out.push({ t: texto.slice(ultimo, ini) });
    if (m[1] !== undefined) out.push({ t: m[1], c: true });
    else if (m[2] !== undefined) out.push({ t: m[2], b: true });
    else out.push({ t: m[4], i: true });
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) out.push({ t: texto.slice(ultimo) });
  return out.filter(x => x.t);
}
export const textoPuro = s => trechos(s).map(x => x.t).join('');

// Só o entregável da resposta, para virar arquivo: sem a abertura curta ("Entendi: ... Vou entregar ...") antes do
// primeiro título e sem a seção final "O que foi feito" (conversa com a pessoa, não parte do documento).
const FECHO = /^\s*#{1,4}\s*\**\s*(o que (foi feito|fiz|mudou|foi (ajustado|alterado|entregue))|resumo (do que foi feito|das (altera[cç][oõ]es|mudan[cç]as))|altera[cç][oõ]es (feitas|aplicadas)|pr[oó]ximos passos sugeridos)\b/i;
export function soEntregavel(texto) {
  let linhas = String(texto || '').replace(/\r/g, '').split('\n');
  const fecho = linhas.findLastIndex(l => FECHO.test(l));
  if (fecho > 0) linhas = linhas.slice(0, fecho);
  const primeiro = linhas.findIndex(l => /^\s*#{1,3}\s+\S/.test(l));
  if (primeiro > 0) {
    const antes = linhas.slice(0, primeiro).filter(l => l.trim());
    // "Título: ..." antes do primeiro título é dado da peça (não conversa): fica.
    if (antes.join(' ').length <= 700 && !antes.some(l => /^\s*(\||[-*]\s|\d+[.)]\s)/.test(l))) linhas = [...antes.filter(l => /^\s*\**t[ií]tulo\**\s*:/i.test(l)), ...linhas.slice(primeiro)];
  }
  while (linhas.length && /^\s*(-{3,}|\*{3,}|_{3,})?\s*$/.test(linhas.at(-1))) linhas.pop();
  return linhas.join('\n');
}

export function blocos(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n'), out = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim() || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { i++; continue; }
    if (/^\s*```/.test(l)) {
      const codigo = [];
      i++;
      while (i < linhas.length && !/^\s*```\s*$/.test(linhas[i])) codigo.push(linhas[i++]);
      i++;
      out.push({ tipo: 'codigo', linhas: codigo });
      continue;
    }
    if (ehTabela(l, linhas[i + 1])) {
      const cab = celulas(l), corpo = [];
      i += 2;
      while (i < linhas.length && /^\s*\|/.test(linhas[i])) corpo.push(celulas(linhas[i++]));
      out.push({ tipo: 'tabela', linhas: [cab, ...corpo.map(r => cab.map((_, k) => r[k] ?? ''))] });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) { out.push({ tipo: 'titulo', nivel: Math.min(3, h[1].length), texto: h[2].replace(/\s*#+\s*$/, '') }); i++; continue; }
    if (ITEM.test(l)) {
      const ordenada = /^\s*\d/.test(l), itens = [], numeros = [];
      while (i < linhas.length && ITEM.test(linhas[i])) {
        numeros.push(Number((/^\s*(\d+)/.exec(linhas[i]) || [])[1]) || null);
        const item = linhas[i++].replace(ITEM, '');
        const ck = /^\[( |x|X)\]\s+(.*)$/.exec(item);
        itens.push(ck ? `${ck[1] === ' ' ? '☐' : '☑'} ${ck[2]}` : item);
      }
      // Lista numerada escrita com linha em branco entre os itens ("1." ... "2."): cada item chega como lista
      // própria; o número escrito vale, para não virar "1." em todos.
      out.push({ tipo: 'lista', ordenada, itens, ...(ordenada ? { numeros } : {}) });
      continue;
    }
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !ehTabela(linhas[i], linhas[i + 1]) && !/^(#{1,6})\s|^\s*```/.test(linhas[i]) && !ITEM.test(linhas[i])) par.push(linhas[i++]);
    out.push({ tipo: 'paragrafo', linhas: par });
  }
  return out;
}

// ---------- XML ----------
// Caracteres de controle não são válidos em XML (o Office recusa o arquivo inteiro): saem antes de escapar.
const x = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const agoraIso = agora => new Date(agora ?? Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z');
const core = (titulo, agora) => `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(titulo)}</dc:title><dc:creator>GreenIA</dc:creator><cp:lastModifiedBy>GreenIA</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${agoraIso(agora)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${agoraIso(agora)}</dcterms:modified></cp:coreProperties>`;
const app = nome => `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>${x(nome)}</Application></Properties>`;
const relsRaiz = principal => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${principal}"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const rels = lista => `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${lista.map(([id, tipo, alvo]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipo}" Target="${alvo}"/>`).join('')}</Relationships>`;
const tipos = (padrao, sobre) => `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${padrao}${sobre.map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

// ---------- Word ----------
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const run = (t, { b, i, c } = {}, extra = '') => `<w:r>${b || i || c || extra ? `<w:rPr>${c ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : ''}${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${extra}</w:rPr>` : ''}<w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
const runs = (s, extra = '') => trechos(s).map(p => run(p.t, p, extra)).join('');
const par = (conteudo, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${conteudo}</w:p>`;

function tabelaWord(linhas, FUNDO_CAB) {
  const n = linhas[0].length, larg = Math.floor(9000 / n);
  const borda = t => `<w:${t} w:val="single" w:sz="4" w:space="0" w:color="B7C4BC"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borda).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${Array.from({ length: n }, () => `<w:gridCol w:w="${larg}"/>`).join('')}</w:tblGrid>${
    linhas.map((l, r) => `<w:tr>${r === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${l.map(c => `<w:tc><w:tcPr><w:tcW w:w="${larg}" w:type="dxa"/>${r === 0 ? `<w:shd w:val="clear" w:color="auto" w:fill="${FUNDO_CAB}"/>` : ''}</w:tcPr>${par(runs(c, r === 0 ? '<w:b/>' : ''), '<w:spacing w:before="40" w:after="40"/>')}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>${par('')}`;
}

export function docx(texto, { titulo = 'Documento', agora, cor, fonte } = {}) {
  const { VERDE, FUNDO_CAB } = paleta(cor), F = x(fonte || 'Calibri');
  const bs = blocos(texto), corpo = [], numeros = [];
  // Sem título de nível 1 no começo, o nome da conversa vira o título do documento.
  if (!(bs[0]?.tipo === 'titulo' && bs[0].nivel === 1)) corpo.push(par(run(textoPuro(titulo)), '<w:pStyle w:val="Title"/>'));
  for (const b of bs) {
    if (b.tipo === 'titulo') corpo.push(par(runs(b.texto), `<w:pStyle w:val="${b.nivel === 1 && corpo.length === 0 ? 'Title' : `Heading${b.nivel}`}"/>`));
    else if (b.tipo === 'paragrafo') corpo.push(par(b.linhas.map(l => runs(l)).join('<w:r><w:br/></w:r>')));
    else if (b.tipo === 'lista') {
      // Cada lista numerada recomeça do 1 (uma numeração própria); as de marcador usam a mesma.
      let num = 1;
      if (b.ordenada) { numeros.push({ id: numeros.length + 2, inicio: b.numeros?.[0] || 1 }); num = numeros.at(-1).id; }
      for (const it of b.itens) corpo.push(par(runs(it), `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${num}"/></w:numPr>`));
    } else if (b.tipo === 'tabela') corpo.push(tabelaWord(b.linhas, FUNDO_CAB));
    else if (b.tipo === 'codigo') corpo.push(...(b.linhas.length ? b.linhas : ['']).map(l => par(run(l, { c: true }), '<w:pStyle w:val="Codigo"/>')));
  }
  const documento = `${XML}<w:document ${W}><w:body>${corpo.join('')}<w:sectPr><w:footerReference w:type="default" r:id="rId3"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  // Rodapé: nome do documento à esquerda e o número da página à direita (campo PAGE, atualizado pelo Word).
  const campo = c => `<w:r><w:rPr><w:color w:val="8A877F"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:color w:val="8A877F"/><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> ${c} </w:instrText></w:r><w:r><w:rPr><w:color w:val="8A877F"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="8A877F"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:color w:val="8A877F"/><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  const rodape = `${XML}<w:ftr ${W}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="D8D3C8"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9070"/></w:tabs></w:pPr><w:r><w:rPr><w:color w:val="8A877F"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${x(textoPuro(bs[0]?.tipo === 'titulo' ? bs[0].texto : titulo).slice(0, 90))}</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:tab/></w:r><w:r><w:rPr><w:color w:val="8A877F"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">Página </w:t></w:r>${campo('PAGE')}</w:p></w:ftr>`;
  const estilo = (id, nome, ppr, rpr, extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nome}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const estilos = `${XML}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${F}" w:hAnsi="${F}" w:eastAsia="${F}" w:cs="${F}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="${TINTA}"/></w:rPr></w:style>`
    + estilo('Title', 'Title', `<w:pBdr><w:bottom w:val="single" w:sz="18" w:space="10" w:color="${VERDE}"/></w:pBdr><w:spacing w:before="480" w:after="360"/>`, `<w:b/><w:color w:val="${VERDE}"/><w:sz w:val="48"/><w:szCs w:val="48"/>`)
    + estilo('Heading1', 'heading 1', `<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="D8D3C8"/></w:pBdr><w:spacing w:before="400" w:after="160"/><w:outlineLvl w:val="0"/>`, `<w:b/><w:color w:val="${VERDE}"/><w:sz w:val="32"/><w:szCs w:val="32"/>`)
    + estilo('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/>', `<w:b/><w:color w:val="${VERDE}"/><w:sz w:val="26"/><w:szCs w:val="26"/>`)
    + estilo('Heading3', 'heading 3', '<w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/>', `<w:b/><w:color w:val="${TINTA}"/><w:sz w:val="24"/><w:szCs w:val="24"/>`)
    + estilo('ListParagraph', 'List Paragraph', '<w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/>', '')
    + estilo('Codigo', 'Código', `<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F3F5F4"/>`, '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/><w:szCs w:val="19"/>')
    + '</w:styles>';
  const nivel = (fmt, txt) => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>${fmt === 'bullet' ? '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr>' : ''}</w:lvl>`;
  const numeracao = `${XML}<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>${nivel('bullet', '')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/>${nivel('decimal', '%1.')}</w:abstractNum>`
    + `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${numeros.map(n => `<w:num w:numId="${n.id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="${n.inicio}"/></w:lvlOverride></w:num>`).join('')}</w:numbering>`;
  return zipar([
    { nome: '[Content_Types].xml', dados: tipos('', [['/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'], ['/word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'], ['/word/numbering.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml'], ['/word/footer1.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml']]) },
    { nome: '_rels/.rels', dados: relsRaiz('word/document.xml') },
    { nome: 'word/document.xml', dados: documento },
    { nome: 'word/styles.xml', dados: estilos },
    { nome: 'word/numbering.xml', dados: numeracao },
    { nome: 'word/footer1.xml', dados: rodape },
    { nome: 'word/_rels/document.xml.rels', dados: rels([['rId1', 'styles', 'styles.xml'], ['rId2', 'numbering', 'numbering.xml'], ['rId3', 'footer', 'footer1.xml']]) },
    { nome: 'docProps/core.xml', dados: core(textoPuro(titulo), agora) },
    { nome: 'docProps/app.xml', dados: app('GreenIA') },
  ]);
}

// ---------- Excel ----------
// Valor da célula como o Excel o guardaria. Convenção brasileira: "1.234,56" (milhar com ponto, decimal com vírgula);
// "1,5" e "1.5" são decimais; "1.234" é mil duzentos e trinta e quatro. Devolve { v, fmt } ou { t } (texto).
export function valorDaCelula(bruto) {
  const s = textoPuro(bruto).trim();
  if (!s) return { t: '' };
  const data = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (data) {
    const [d, m, a] = data.slice(1).map(Number), ms = Date.UTC(a, m - 1, d), dt = new Date(ms);
    if (dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && a >= 1900) return { v: ms / 86400000 + 25569, fmt: 'dd/mm/yyyy' };
    return { t: s };
  }
  const m = /^([-+−]?)\s*(R\$)?\s*([-+−]?)\s*(\d[\d.,\s]*?)\s*(%?)$/.exec(s.replace(/ /g, ' '));
  if (!m) return { t: s };
  const sinal = (m[1] || m[3]) && /[-−]/.test(m[1] + m[3]) ? -1 : 1, moeda = !!m[2], pct = !!m[5];
  const n = m[4].replace(/\s/g, '');
  // Código, CEP, matrícula: zero à esquerda (que não seja "0," ou "0.") ou mais de 15 dígitos ficam como texto.
  if (/^0\d/.test(n) || n.replace(/\D/g, '').length > 15) return { t: s };
  let inteiro, dec = '';
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(n)) [inteiro, dec = ''] = n.replace(/\./g, '').split(',');
  else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(n)) [inteiro, dec] = n.replace(/,/g, '').split('.');
  else if (/^\d+(,\d+)?$/.test(n)) [inteiro, dec = ''] = n.split(',');
  else if (/^\d+\.\d+$/.test(n)) [inteiro, dec] = n.split('.');
  else return { t: s };
  let v = sinal * Number(`${inteiro}.${dec || 0}`);
  if (!Number.isFinite(v)) return { t: s };
  const casas = Math.min(dec.length, 6);
  if (pct) return { v: Number((v / 100).toPrecision(15)), fmt: `0${casas ? '.' + '0'.repeat(casas) : ''}%` };
  if (moeda) return { v, fmt: '"R$" #,##0.00;-"R$" #,##0.00' };
  return { v, fmt: `#,##0${casas ? '.' + '0'.repeat(casas) : ''}` };
}

// Fórmula escrita na célula ("=SUM(B2:B13)", "=SOMA(B2;B13)"): vira fórmula de verdade na planilha. Nomes em
// português das funções mais comuns e o separador ";" são aceitos. Funções que buscam dados fora da planilha ou
// executam algo (WEBSERVICE, HYPERLINK, DDE...) nunca viram fórmula: ficam como texto.
const FUNCOES_PT = { SOMA: 'SUM', 'MÉDIA': 'AVERAGE', MEDIA: 'AVERAGE', SE: 'IF', 'MÁXIMO': 'MAX', MAXIMO: 'MAX', 'MÍNIMO': 'MIN', MINIMO: 'MIN', PROCV: 'VLOOKUP', PROCH: 'HLOOKUP',
  ARRED: 'ROUND', ARREDONDAR: 'ROUND', SOMASE: 'SUMIF', SOMASES: 'SUMIFS', 'CONT.SE': 'COUNTIF', 'CONT.SES': 'COUNTIFS', 'CONT.VALORES': 'COUNTA', CONT_VALORES: 'COUNTA', 'CONT.NÚM': 'COUNT', SEERRO: 'IFERROR',
  E: 'AND', OU: 'OR', ABS: 'ABS', VPL: 'NPV', TIR: 'IRR', PGTO: 'PMT', 'MÉDIASE': 'AVERAGEIF', SOMARPRODUTO: 'SUMPRODUCT', 'ÍNDICE': 'INDEX', INDICE: 'INDEX', CORRESP: 'MATCH', HOJE: 'TODAY', ANO: 'YEAR', 'MÊS': 'MONTH', MES: 'MONTH' };
const PROIBIDAS = /\b(WEBSERVICE|HYPERLINK|HIPERLINK|CALL|REGISTER|REGISTER\.ID|EXEC|IMPORTXML|IMPORTDATA|IMPORTHTML|FILTERXML|RTD|INFO|CELL)\s*\(|[|\\]|^=\s*[-+@]?\s*cmd/i;
export function formulaDaCelula(bruto) {
  // Texto cru da célula: "*" é multiplicação (o leitor de Markdown o tomaria por itálico); só tira negrito/código em volta.
  const s = String(bruto ?? '').trim().replace(/^\*\*([\s\S]*)\*\*$/, '$1').replace(/^`([\s\S]*)`$/, '$1').trim();
  if (!/^=\s*\S/.test(s) || s.length > 2000 || PROIBIDAS.test(s) || !/[A-Za-z(]/.test(s.slice(1)) && !/[\d.]+\s*[-+*/^]/.test(s)) return null;
  let f = '', aspas = false;
  for (const ch of s.slice(1)) { if (ch === '"') aspas = !aspas; f += !aspas && ch === ';' ? ',' : ch; }
  f = f.replace(/(^|[^A-Za-z0-9_.'!])([A-Za-zÀ-ú][A-Za-zÀ-ú0-9_.]*)\s*\(/g, (m, a, nome) => `${a}${FUNCOES_PT[nome.toUpperCase()] || nome.toUpperCase()}(`);
  // Números com vírgula decimal (fora de função) não são comuns em fórmula; "1,5" dentro de função seria argumento.
  if (!/^[\w\s$!:.,()+\-*/^%<>=&"'À-ú]+$/.test(f)) return null;
  return f;
}

const coluna = k => { let s = ''; for (k++; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(65 + ((k - 1) % 26)) + s; return s; };
const nomeDaAba = (s, usados) => {
  let n = String(s || 'Tabela').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Tabela';
  for (let k = 2; usados.has(n.toLowerCase()); k++) n = `${n.slice(0, 28)} ${k}`;
  usados.add(n.toLowerCase());
  return n;
};

// tabelas: [{ nome, linhas: [[cabeçalho...], [...]] }]
export function xlsx(tabelas, { titulo = 'Planilha', agora, cor } = {}) {
  const { FUNDO_CAB } = paleta(cor);
  if (!tabelas.length) throw new Error('sem tabela');
  const formatos = new Map();   // formato -> índice de estilo (0 = padrão, 1 = cabeçalho)
  const estiloDe = fmt => { if (!formatos.has(fmt)) formatos.set(fmt, formatos.size + 2); return formatos.get(fmt); };
  const usados = new Set();
  let temFormula = false;
  const abas = tabelas.map((tab, k) => {
    const linhas = tab.linhas, largura = linhas[0].map(() => 8), formatoDaColuna = {};
    const xmlLinhas = linhas.map((l, r) => `<row r="${r + 1}">${l.map((c, k2) => {
      const ref = `${coluna(k2)}${r + 1}`;
      const formula = r === 0 ? null : formulaDaCelula(c);
      if (formula) { largura[k2] = Math.max(largura[k2], 14); temFormula = true; return `<c r="${ref}" s="${estiloDe(formatoDaColuna[k2] || '#,##0.00')}"><f>${x(formula)}</f></c>`; }
      const cel = r === 0 ? { t: textoPuro(c) } : valorDaCelula(c);
      if (r > 0 && cel.fmt && !formatoDaColuna[k2]) formatoDaColuna[k2] = cel.fmt;
      const vis = cel.t ?? String(c);
      largura[k2] = Math.max(largura[k2], Math.min(60, [...vis].length + 2));
      if (cel.t !== undefined) return cel.t === '' && r ? '' : `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${x(cel.t)}</t></is></c>`;
      return `<c r="${ref}" s="${estiloDe(cel.fmt)}"><v>${cel.v}</v></c>`;
    }).join('')}</row>`).join('');
    const ultima = `${coluna(linhas[0].length - 1)}${linhas.length}`;
    const folha = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:${ultima}"/><sheetViews><sheetView workbookViewId="0"${k === 0 ? ' tabSelected="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${largura.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${xmlLinhas}</sheetData>${linhas.length > 1 ? `<autoFilter ref="A1:${ultima}"/>` : ''}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
    const filtro = linhas.length > 1 ? `$A$1:$${coluna(linhas[0].length - 1)}$${linhas.length}` : null;
    return { nome: nomeDaAba(tab.nome || `Tabela ${k + 1}`, usados), folha, filtro };
  });
  const fmts = [...formatos.keys()];
  const estilos = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fmts.length ? `<numFmts count="${fmts.length}">${fmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${x(f)}"/>`).join('')}</numFmts>` : ''}<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FF${TINTA}"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${FUNDO_CAB}"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${2 + fmts.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>${fmts.map((_, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const livro = `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${abas.map((a, i) => `<sheet name="${x(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${abas.some(a => a.filtro) ? `<definedNames>${abas.map((a, i) => (a.filtro ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${x(a.nome.replace(/'/g, "''"))}'!${a.filtro}</definedName>` : '')).join('')}</definedNames>` : ''}${temFormula ? '<calcPr calcId="191029" fullCalcOnLoad="1"/>' : ''}</workbook>`;
  return zipar([
    { nome: '[Content_Types].xml', dados: tipos('', [['/xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'], ['/xl/styles.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'], ...abas.map((_, i) => [`/xl/worksheets/sheet${i + 1}.xml`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'])]) },
    { nome: '_rels/.rels', dados: relsRaiz('xl/workbook.xml') },
    { nome: 'xl/workbook.xml', dados: livro },
    { nome: 'xl/_rels/workbook.xml.rels', dados: rels([...abas.map((_, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`]), [`rId${abas.length + 1}`, 'styles', 'styles.xml']]) },
    { nome: 'xl/styles.xml', dados: estilos },
    ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, dados: a.folha })),
    { nome: 'docProps/core.xml', dados: core(textoPuro(titulo), agora) },
    { nome: 'docProps/app.xml', dados: app('GreenIA') },
  ]);
}

// ---------- PowerPoint ----------
// Slide 16:9 (33,867 x 19,05 cm). Uma seção (título de nível 1 ou 2) por slide; conteúdo longo continua no slide
// seguinte com "(continuação)", em vez de vazar da caixa. Tabela vira tabela do PowerPoint (até 8 linhas por slide,
// com o cabeçalho repetido).
const EMU = 12700, SW = 12192000, SH = 6858000;
const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const LINHAS_POR_SLIDE = 10, CARACTERES_POR_LINHA = 86, LINHAS_DE_TABELA = 8;

const rPr = (p, tam, cor, extra = '') => `<a:rPr lang="pt-BR" sz="${tam}"${p.b ? ' b="1"' : ''}${p.i ? ' i="1"' : ''}${p.spc ? ` spc="${p.spc}"` : ''} dirty="0">${extra}<a:solidFill><a:srgbClr val="${cor}"/></a:solidFill><a:latin typeface="${p.c ? 'Consolas' : p.fonte ? x(p.fonte) : '+mn-lt'}"/></a:rPr>`;
const aRuns = (s, tam, cor, forcar = {}) => trechos(s).map(p => `<a:r>${rPr({ ...p, ...forcar }, tam, cor)}<a:t>${x(p.t)}</a:t></a:r>`).join('') || `<a:endParaRPr lang="pt-BR" sz="${tam}"/>`;
const caixa = (id, nome, [xx, yy, w, h], paras, { ancora = 't' } = {}) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${x(nome)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${xx}" y="${yy}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${ancora}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
const faixa = (id, [xx, yy, w, h], cor) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Faixa"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${xx}" y="${yy}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;

function tabelaSlide(id, linhas, [xx, yy, w], FUNDO_CAB) {
  const n = linhas[0].length, cw = Math.floor(w / n), rh = 48 * EMU;
  const cel = (c, cab) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>${aRuns(c, 1600, TINTA, cab ? { b: true } : {})}</a:p></a:txBody><a:tcPr marL="91440" marR="91440" marT="45720" marB="45720">${['lnL', 'lnR', 'lnT', 'lnB'].map(l => `<a:${l} w="9525"><a:solidFill><a:srgbClr val="B7C4BC"/></a:solidFill></a:${l}>`).join('')}<a:solidFill><a:srgbClr val="${cab ? FUNDO_CAB : 'FFFFFF'}"/></a:solidFill></a:tcPr></a:tc>`;
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Tabela"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${xx}" y="${yy}"/><a:ext cx="${cw * n}" cy="${rh * linhas.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${Array.from({ length: n }, () => `<a:gridCol w="${cw}"/>`).join('')}</a:tblGrid>${linhas.map((l, r) => `<a:tr h="${rh}">${l.map(c => cel(c, r === 0)).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

// Itens de texto de um bloco: { texto, marcador: '•' | 'n.' | null, codigo }
function itensDoBloco(b) {
  if (b.tipo === 'paragrafo') return [{ texto: b.linhas.join(' ') }];
  if (b.tipo === 'lista') return b.itens.map((t, k) => ({ texto: t, marcador: b.ordenada ? `${b.numeros?.[k] ?? k + 1}.` : '•' }));
  if (b.tipo === 'codigo') return b.linhas.map(t => ({ texto: t, codigo: true }));
  if (b.tipo === 'titulo') return [{ texto: b.texto, sub: true }];
  return [];
}
const linhasDe = it => Math.max(1, Math.ceil([...textoPuro(it.texto)].length / CARACTERES_POR_LINHA));

// Seções -> slides: [{ titulo, itens } | { titulo, tabela }].
// Roteiro "slide a slide" escrito na resposta ("Slide 3: Método", "---", rótulos com letras espaçadas copiados de
// um PDF): cada "Slide N" vira uma seção (um slide) e o que é só marcação sai.
const SLIDE_N = /^\s*#{0,4}\s*\**\s*slide\s+\d+\s*\**\s*(?:[:\-–—.]\s*\**\s*(.+?))?\s*\**\s*$/i;
const soLetrasEspacadas = l => { const t = l.replace(/[·•|]/g, ' ').trim().split(/\s+/); return t.length >= 4 && t.filter(x => x.length === 1).length / t.length > 0.6; };
export function roteiroLimpo(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n');
  if (linhas.filter(l => SLIDE_N.test(l)).length < 3) return texto;
  // Cada linha do roteiro é um item do slide (no roteiro, quebra de linha separa ideias).
  const inicio = linhas.findIndex(l => SLIDE_N.test(l));   // o que vem antes do 1º slide é conversa, não slide
  const limpas = [];
  let semTitulo = false, ultimoTitulo = '';   // "Slide 3" sem título: a primeira linha de texto do slide vira o título
  for (const l0 of linhas.slice(inicio)) {
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l0) || soLetrasEspacadas(l0)) continue;
    const l = juntarLetrasEspacadas(l0), m = SLIDE_N.exec(l);
    if (m) { if (m[1]) limpas.push(`## ${m[1].replace(/\*+$/, '')}`); semTitulo = !m[1]; ultimoTitulo = textoPuro(m[1] || ''); continue; }
    // Dentro do roteiro, só "Slide N" abre slide: outro título ("# O Problema", "### Antes") vira destaque do slide,
    // e o título que só repete o do slide sai (antes cada um virava um slide a mais: 25 títulos, 45 slides).
    const h = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/.exec(l);
    if (h && !semTitulo) {
      const t = h[1].replace(/\*+/g, '').trim(), base = x => textoPuro(x).toLowerCase().replace(/[^a-z0-9à-ú]+/g, ' ').trim();
      if (t && !base(ultimoTitulo).includes(base(t)) && !base(t).includes(base(ultimoTitulo) || '\u0000')) limpas.push(`**${t}**`);
      continue;
    }
    if (semTitulo && l.trim()) { limpas.push(`## ${l.replace(/^\s*[#>*-]+\s*|\*+/g, '').trim()}`); semTitulo = false; continue; }
    limpas.push(l);
  }
  return limpas.map((l, i) => (l.trim() && !/^\s*([-*]|\d+[.)])\s|^\s*\|/.test(l) && limpas[i + 1]?.trim() && !/^\s*\|/.test(limpas[i + 1]) ? `${l}\n` : l)).join('\n');
}

export function slides(texto, titulo) {
  const bs = blocos(roteiroLimpo(texto)), secoes = [];
  let capa = textoPuro(titulo), atual = null;
  bs.forEach((b, k) => {
    if (b.tipo === 'titulo' && b.nivel === 1 && k === 0) { capa = textoPuro(b.texto); return; }
    if (b.tipo === 'titulo' && b.nivel <= 2) { atual = { titulo: textoPuro(b.texto), blocos: [], capa: /^capa\b/i.test(textoPuro(b.texto)) }; secoes.push(atual); return; }
    if (!atual) { atual = { titulo: capa, blocos: [] }; secoes.push(atual); }
    atual.blocos.push(b);
  });
  // Seção "Capa" do roteiro: a linha mais longa vira o título da capa; não vira slide de conteúdo.
  let aberturaCapa = '';
  const iCapa = secoes.findIndex(x => x.capa);
  if (iCapa >= 0) {
    const linhasCapa = secoes[iCapa].blocos.flatMap(itensDoBloco).map(i => textoPuro(i.texto)).filter(Boolean);
    const maior = linhasCapa.reduce((a, b) => (b.length > a.length ? b : a), '');
    if (maior) { capa = maior; aberturaCapa = linhasCapa.filter(l => l !== maior)[0] || ''; }
    secoes.splice(iCapa, 1);
  }
  const out = [];
  for (const s of secoes) {
    let itens = [], linhas = 0, partes = 0;
    // Seção que passa um pouco do limite fica num slide só, com letra menor: dividir criaria slides de
    // "continuação" e mudaria o número de slides que a pessoa pediu.
    const total = s.blocos.every(b => b.tipo !== 'tabela') ? s.blocos.flatMap(itensDoBloco).reduce((n, it) => n + Math.min(LINHAS_POR_SLIDE, linhasDe(it)), 0) : Infinity;
    const limite = total <= LINHAS_POR_SLIDE * 1.6 ? Infinity : LINHAS_POR_SLIDE;
    const fechar = () => { if (itens.length || !partes) out.push({ titulo: partes ? `${s.titulo} (continuação)` : s.titulo, itens, ...(limite === Infinity && total > LINHAS_POR_SLIDE ? { compacto: true } : {}) }); partes++; itens = []; linhas = 0; };
    // Texto curto + uma tabela pequena: o mesmo slide (texto em cima, tabela embaixo), sem "continuação".
    const tabs = s.blocos.filter(b => b.tipo === 'tabela'), textos = s.blocos.filter(b => b.tipo !== 'tabela').flatMap(itensDoBloco);
    if (tabs.length === 1 && tabs[0].linhas.length <= 6 && textos.length && textos.reduce((n, it) => n + linhasDe(it), 0) <= 3) {
      out.push({ titulo: s.titulo, itens: textos, tabela: tabs[0].linhas, junto: true });
      continue;
    }
    for (const b of s.blocos) {
      if (b.tipo === 'tabela') {
        if (itens.length) fechar();
        const [cab, ...corpo] = b.linhas;
        for (let i = 0; i < Math.max(1, corpo.length); i += LINHAS_DE_TABELA) { out.push({ titulo: partes ? `${s.titulo} (continuação)` : s.titulo, tabela: [cab, ...corpo.slice(i, i + LINHAS_DE_TABELA)] }); partes++; }
        continue;
      }
      for (const it of itensDoBloco(b)) {
        const n = Math.min(LINHAS_POR_SLIDE, linhasDe(it));
        if (linhas + n > limite && itens.length) fechar();
        itens.push(it); linhas += n;
      }
    }
    if (itens.length || !partes) fechar();
  }
  // Abertura curta antes da primeira seção vai para a capa (como subtítulo), em vez de ocupar um slide quase vazio.
  let abertura = aberturaCapa;
  const primeiro = out[0];
  if (primeiro && primeiro.titulo === capa && !primeiro.tabela && primeiro.itens.length === 1 && !primeiro.itens[0].marcador && !primeiro.itens[0].codigo && out.length > 1
    && textoPuro(primeiro.itens[0].texto).length <= 240) { abertura = primeiro.itens[0].texto; out.shift(); }
  return { capa, abertura, slides: out };
}

const TEMA = (VERDE, F) => `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="GreenIA"><a:themeElements><a:clrScheme name="GreenIA"><a:dk1><a:srgbClr val="${TINTA}"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${VERDE}"/></a:dk2><a:lt2><a:srgbClr val="F4F7F5"/></a:lt2><a:accent1><a:srgbClr val="${VERDE}"/></a:accent1><a:accent2><a:srgbClr val="4CB884"/></a:accent2><a:accent3><a:srgbClr val="2E6B8A"/></a:accent3><a:accent4><a:srgbClr val="C9A227"/></a:accent4><a:accent5><a:srgbClr val="8A5A9E"/></a:accent5><a:accent6><a:srgbClr val="C4573A"/></a:accent6><a:hlink><a:srgbClr val="1B6E9A"/></a:hlink><a:folHlink><a:srgbClr val="6B4E8A"/></a:folHlink></a:clrScheme><a:fontScheme name="GreenIA"><a:majorFont><a:latin typeface="${F}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${F}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="GreenIA"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
const ARVORE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const MESTRE = `${XML}<p:sldMaster ${P}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${ARVORE}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
const LAYOUT = `${XML}<p:sldLayout ${P} type="blank" preserve="1"><p:cSld name="Em branco"><p:spTree>${ARVORE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

export function pptx(texto, { titulo = 'Apresentação', subtitulo = '', agora, cor, fonte } = {}) {
  const { VERDE, FUNDO_CAB } = paleta(cor), F = x(fonte || 'Calibri');
  const { capa, abertura, slides: lista } = slides(texto, titulo);
  // Desenho editorial (o mesmo sistema visual das páginas da GreenIA): capa escura com título em serifa; slides em
  // marfim com rótulo da seção em versalete, título em serifa, filete, texto em sans e rodapé com nome e número.
  const M = 64 * EMU, LARG = SW - 2 * M, ESCURO = '1A1915', MARFIM = 'F8F6F1', CORPO = '3D3B36', FIO = 'D8D3C8', RODAPE = '8A877F';
  const TITULO = 'Georgia', MONO = 'Courier New';
  const destaque = cor ? misturar(`#${VERDE}`, '#FFFFFF', 0.35).slice(1) : 'B9E85A';
  const sld = (forma, fundo) => `${XML}<p:sld ${P}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${fundo}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${ARVORE}${forma}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const rotulo = (t, corR, tam = 1000) => `<a:p>${aRuns(t.toLocaleUpperCase('pt-BR'), tam, corR, { fonte: MONO, spc: 300 })}</a:p>`;
  const nomeCurto = textoPuro(capa).slice(0, 60);
  const xmls = [sld(
    caixa(2, 'Rótulo', [M, 120 * EMU, LARG, 24 * EMU], rotulo('Apresentação', destaque, 1100))
    + caixa(3, 'Título', [M, 150 * EMU, LARG, 190 * EMU], `<a:p><a:pPr algn="l"><a:lnSpc><a:spcPct val="95000"/></a:lnSpc></a:pPr>${aRuns(capa, 4800, 'FFFFFF', { fonte: TITULO })}</a:p>`, { ancora: 'b' })
    + (abertura ? caixa(4, 'Abertura', [M, 362 * EMU, LARG * 0.8, 80 * EMU], `<a:p>${aRuns(abertura, 1800, 'D8D3C8')}</a:p>`) : '')
    + faixa(5, [M, 470 * EMU, LARG, Math.round(0.75 * EMU)], '3D3B36')
    + caixa(6, 'Rodapé', [M, 482 * EMU, LARG, 20 * EMU], rotulo(subtitulo || 'GreenIA', 'A3A3A0', 900)), ESCURO)];
  lista.forEach((s, k) => {
    const n = String(k + 1).padStart(2, '0');
    let forma = caixa(2, 'Rótulo', [M, 40 * EMU, LARG, 20 * EMU], rotulo(`${n} · ${textoPuro(s.titulo).replace(/ \(continuação\)$/, '')}`.slice(0, 70), VERDE))
      + caixa(3, 'Título', [M, 54 * EMU, LARG, 72 * EMU], `<a:p><a:pPr><a:lnSpc><a:spcPct val="92000"/></a:lnSpc></a:pPr>${aRuns(s.titulo, textoPuro(s.titulo).length > 48 ? 2600 : 3200, TINTA, { fonte: TITULO })}</a:p>`, { ancora: 'b' })
      + faixa(4, [M, 134 * EMU, LARG, Math.round(0.75 * EMU)], FIO);
    if (s.tabela && !s.junto) forma += tabelaSlide(5, s.tabela, [M, 152 * EMU, LARG], FUNDO_CAB);
    else {
      const paras = s.itens.map(it => {
        if (it.sub) return `<a:p><a:pPr><a:spcBef><a:spcPts val="1000"/></a:spcBef></a:pPr>${aRuns(it.texto, 2000, TINTA, { b: true })}</a:p>`;
        const tam = it.codigo ? 1400 : s.compacto ? 1450 : 1800;
        const marca = it.marcador === '•' ? `<a:pPr marL="285750" indent="-285750"><a:lnSpc><a:spcPct val="112000"/></a:lnSpc><a:spcBef><a:spcPts val="${s.compacto ? 500 : 900}"/></a:spcBef><a:buClr><a:srgbClr val="${VERDE}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>`
          : it.marcador ? `<a:pPr marL="342900" indent="-342900"><a:lnSpc><a:spcPct val="112000"/></a:lnSpc><a:spcBef><a:spcPts val="${s.compacto ? 500 : 900}"/></a:spcBef><a:buNone/></a:pPr>`
          : `<a:pPr><a:lnSpc><a:spcPct val="112000"/></a:lnSpc><a:spcBef><a:spcPts val="${it.codigo ? 0 : s.compacto ? 500 : 900}"/></a:spcBef><a:buNone/></a:pPr>`;
        // Número escrito no texto (não automático): a continuação num slide novo segue a contagem da lista.
        const numero = it.marcador && it.marcador !== '•' ? `<a:r>${rPr({ b: true }, tam, VERDE)}<a:t>${it.marcador}\t</a:t></a:r>` : '';
        return `<a:p>${marca}${numero}${it.codigo ? `<a:r>${rPr({ c: true }, tam, CORPO)}<a:t>${x(it.texto)}</a:t></a:r>` : aRuns(it.texto, tam, CORPO)}</a:p>`;
      });
      forma += caixa(5, 'Conteúdo', [M, 152 * EMU, LARG, (s.junto ? 92 : 318) * EMU], paras.join('') || '<a:p><a:endParaRPr lang="pt-BR"/></a:p>');
      if (s.junto) forma += tabelaSlide(8, s.tabela, [M, 252 * EMU, LARG], FUNDO_CAB);
    }
    forma += caixa(6, 'Rodapé', [M, 500 * EMU, LARG * 0.8, 18 * EMU], rotulo(nomeCurto, RODAPE, 800))
      + caixa(7, 'Número', [SW - M - 60 * EMU, 500 * EMU, 60 * EMU, 18 * EMU], `<a:p><a:pPr algn="r"/>${aRuns(String(k + 2).padStart(2, '0'), 800, RODAPE, { fonte: MONO })}</a:p>`);
    xmls.push(sld(forma, MARFIM));
  });
  const finais = xmls;
  const apresentacao = `${XML}<p:presentation ${P} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${finais.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr lang="pt-BR"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`;
  return zipar([
    { nome: '[Content_Types].xml', dados: tipos('', [['/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'], ['/ppt/slideMasters/slideMaster1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'], ['/ppt/slideLayouts/slideLayout1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'], ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'], ['/ppt/presProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml'], ['/ppt/viewProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml'], ['/ppt/tableStyles.xml', 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml'], ...finais.map((_, i) => [`/ppt/slides/slide${i + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'])]) },
    { nome: '_rels/.rels', dados: relsRaiz('ppt/presentation.xml') },
    { nome: 'ppt/presentation.xml', dados: apresentacao },
    { nome: 'ppt/_rels/presentation.xml.rels', dados: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...finais.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`]), [`rId${finais.length + 3}`, 'presProps', 'presProps.xml'], [`rId${finais.length + 4}`, 'viewProps', 'viewProps.xml'], [`rId${finais.length + 5}`, 'tableStyles', 'tableStyles.xml']]) },
    { nome: 'ppt/presProps.xml', dados: `${XML}<p:presentationPr ${P}/>` },
    { nome: 'ppt/viewProps.xml', dados: `${XML}<p:viewPr ${P}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>` },
    { nome: 'ppt/tableStyles.xml', dados: `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` },
    { nome: 'ppt/slideMasters/slideMaster1.xml', dados: MESTRE },
    { nome: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', dados: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
    { nome: 'ppt/slideLayouts/slideLayout1.xml', dados: LAYOUT },
    { nome: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', dados: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { nome: 'ppt/theme/theme1.xml', dados: TEMA(VERDE, F) },
    ...finais.flatMap((s, i) => [{ nome: `ppt/slides/slide${i + 1}.xml`, dados: s }, { nome: `ppt/slides/_rels/slide${i + 1}.xml.rels`, dados: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) }]),
    { nome: 'docProps/core.xml', dados: core(capa, agora) },
    { nome: 'docProps/app.xml', dados: app('GreenIA') },
  ]);
}

export const MIMES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
// Nome do arquivo a partir do título (sem acento nem símbolo, para funcionar em qualquer sistema).
export const nomeDoArquivo = (titulo, ext) => `${String(titulo || 'greenia').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'greenia'}.${ext}`;

// ---------- PowerPoint a partir de um modelo (PDF lido por modelo-pdf.js) ----------
// Um slide por página do modelo: o fundo da página (sem o texto) e uma caixa de texto editável por bloco, na mesma
// posição, fonte, tamanho e cor. `textos` troca o texto de cada bloco (id -> texto novo); sem troca, fica o original.

// ---- Slide nativo a partir das formas do PDF: fundo como cor, formas e linhas editáveis, imagens soltas ----
const corDe = (c, alfa = 1) => {
  const h = String(c || '').trim();
  let r, g, b, a = alfa;
  if (/^#[0-9a-f]{6}$/i.test(h)) [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  else { const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(h); if (!m) return null; [r, g, b] = [m[1], m[2], m[3]].map(Number); if (m[4] !== undefined) a *= Number(m[4]); }
  return { hex: [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(), a };
};
const preenchimento = c => `<a:solidFill><a:srgbClr val="${c.hex}">${c.a < 0.995 ? `<a:alpha val="${Math.round(c.a * 100000)}"/>` : ''}</a:srgbClr></a:solidFill>`;
function caixaDe(d) {
  const xs = [], ys = [];
  for (const [, ...v] of d) for (let i = 0; i < v.length; i += 2) { xs.push(v[i]); ys.push(v[i + 1]); }
  return xs.length ? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } : null;
}
const ehRetangulo = d => {
  const pts = d.filter(s => s[0] !== 'Z');
  if (pts.some(s => s[0] === 'C' || s[0] === 'Q') || pts.length < 4 || pts.length > 5 || pts.slice(1).some(s => s[0] !== 'L')) return false;
  const p = pts.map(s => [s[1], s[2]]);
  return p.every((q, i) => { const r = p[(i + 1) % p.length]; return Math.abs(q[0] - r[0]) < 0.5 || Math.abs(q[1] - r[1]) < 0.5; });
};
export function formaNativa(e, id, PT) {
  const cx = caixaDe(e.d);
  if (!cx) return '';
  const c = corDe(e.cor, e.alfa ?? 1);
  if (!c || c.a < 0.01) return '';
  const linha = e.modo === 'stroke';
  const w = Math.max(1, Math.round(cx.w * PT)), h = Math.max(1, Math.round(cx.h * PT));
  const geo = !linha && ehRetangulo(e.d) ? '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
    : `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${w}" h="${h}"${linha ? ' fill="none"' : ''}>${e.d.map(([k, ...v]) => {
      const pt = i => `<a:pt x="${Math.round((v[i] - cx.x) * PT)}" y="${Math.round((v[i + 1] - cx.y) * PT)}"/>`;
      return k === 'M' ? `<a:moveTo>${pt(0)}</a:moveTo>` : k === 'L' ? `<a:lnTo>${pt(0)}</a:lnTo>` : k === 'C' ? `<a:cubicBezTo>${pt(0)}${pt(2)}${pt(4)}</a:cubicBezTo>` : k === 'Q' ? `<a:quadBezTo>${pt(0)}${pt(2)}</a:quadBezTo>` : '<a:close/>';
    }).join('')}</a:path></a:pathLst></a:custGeom>`;
  const visual = linha ? `<a:noFill/><a:ln w="${Math.max(3175, Math.round((e.largura || 1) * PT))}">${preenchimento(c)}</a:ln>` : `${preenchimento(c)}<a:ln><a:noFill/></a:ln>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Forma ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(cx.x * PT)}" y="${Math.round(cx.y * PT)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>${geo}${visual}</p:spPr></p:sp>`;
}
// Fundo do slide: a primeira forma que cobre a página inteira vira a cor de fundo (e sai da lista de formas).
export function fundoNativo(p) {
  const i = (p.elementos || []).findIndex(e => e.t === 'forma' && e.modo === 'fill' && (() => { const c = caixaDe(e.d); return c && c.x <= p.w * 0.02 && c.y <= p.h * 0.02 && c.w >= p.w * 0.96 && c.h >= p.h * 0.96; })());
  return i < 0 ? { cor: null, elementos: p.elementos || [] } : { cor: corDe(p.elementos[i].cor), elementos: p.elementos.filter((_, k) => k !== i) };
}

export function pptxDeModelo(paginas, { textos = {}, titulo = 'Apresentação', agora } = {}) {
  const PT = 12700;
  const W = Math.round(paginas[0].w * PT), H = Math.round(paginas[0].h * PT);
  // Imagens de cada slide (iguais entre slides viram um arquivo só) e as relações de cada slide.
  const midias = new Map(), relsSlide = paginas.map(() => []);
  const midiaDe = (e, n) => {
    const chave = createHash('sha1').update(e.dados).digest('hex');
    if (!midias.has(chave)) midias.set(chave, { nome: `imagem${midias.size + 1}.${e.mime}`, dados: e.dados });
    const alvo = `../media/${midias.get(chave).nome}`;
    let r = relsSlide[n].find(x => x.alvo === alvo);
    if (!r) { r = { id: `rId${relsSlide[n].length + 3}`, alvo }; relsSlide[n].push(r); }
    return r.id;
  };
  const xmls = paginas.map((p, n) => {
    const sx = W / (p.w * PT), sy = H / (p.h * PT);
    // Nativo: fundo como cor do slide, formas editáveis e imagens soltas. Sem as formas lidas (página com degradê ou
    // padrão que não dá para recriar), a página inteira vira a imagem de fundo, como antes.
    const nativo = Array.isArray(p.elementos);
    const fn = nativo ? fundoNativo(p) : null;
    let idForma = 1000;
    const formas = nativo ? fn.elementos.map(e => {
      if (e.t === 'forma') return formaNativa(e, idForma++, PT * sx);
      const r = midiaDe(e, n);
      return `<p:pic><p:nvPicPr><p:cNvPr id="${idForma++}" name="Imagem"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${r}">${(e.alfa ?? 1) < 0.995 ? `<a:alphaModFix amt="${Math.round(e.alfa * 100000)}"/>` : ''}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round(e.x * PT * sx)}" y="${Math.round(e.y * PT * sy)}"/><a:ext cx="${Math.round(e.w * PT * sx)}" cy="${Math.round(e.h * PT * sy)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    }).join('') : '';
    const fundo = nativo ? formas : `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Fundo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    const caixas = p.blocos.map((b, k) => {
      const texto = textos[b.id] ?? b.texto;
      if (!String(texto).trim()) return '';   // item sem conteúdo no novo projeto: sai do slide
      const topo = (b.y - b.tam * 0.92) * PT * sy, esq = b.x * PT * sx;
      // Espaço da coluna: até o próximo bloco à direita na mesma faixa de altura (ou a margem do slide). Texto novo
      // mais longo que o original quebra dentro da coluna em vez de invadir a vizinha.
      const vizinho = p.blocos.filter(o => o !== b && o.x > b.x + b.largura * 0.5 && o.y > b.y - b.tam * 1.5 && o.y - o.tam < b.y + (b.linhas - 1) * b.entrelinha + b.tam * 0.5).reduce((m, o) => Math.min(m, o.x), p.w * 0.95);
      const coluna = Math.max(b.largura, vizinho - b.x - b.tam * 0.6);
      const maior = String(texto).length > b.texto.length * 1.02;
      // Linha única que cresceu: continua numa linha só enquanto couber até a coluna, diminuindo a fonte se preciso
      // (até 70%); só quebra se nem assim couber. Assim não invade o bloco de baixo.
      // Largura necessária com folga para fonte substituta mais larga (até ~0,6 do tamanho por letra).
      const precisa = Math.max(b.largura * String(texto).length / Math.max(1, b.texto.length), maior ? String(texto).length * b.tam * (b.negrito ? 0.6 : 0.54) : 0);
      const reducaoLinha = b.linhas === 1 && maior && precisa > coluna ? Math.max(0.85, coluna / precisa) : 1;
      const quebra = b.linhas > 1 || (maior && precisa * reducaoLinha > coluna * 1.01);
      // Bloco de várias linhas mantém a largura do original (a quebra do desenho); linha única que cresceu usa a coluna.
      const larg = Math.min(W - esq, (b.linhas > 1 ? (maior ? Math.max(b.largura * 1.03 + b.tam * 0.3, Math.min(coluna, b.largura * 1.25 + b.tam)) : b.largura * 1.06 + b.tam * 0.4) : maior ? Math.max(coluna, b.largura * 1.04) : b.largura * 1.04 + b.tam * 0.6) * PT * sx);
      // Texto bem maior que o original (mais de 15% acima da capacidade do espaço): a fonte diminui até caber, até 70%.
      let escala = b.linhas > 1 ? (String(texto).length > b.texto.length * 1.15 ? Math.max(0.85, Math.sqrt(b.texto.length / String(texto).length)) : 1) : reducaoLinha;
      // Altura livre até o bloco de baixo (na mesma faixa horizontal): o texto quebrado nunca cobre o de baixo; a fonte
      // diminui até caber (até 55%).
      const largPt = larg / (PT * sx), fimOriginal = b.y + (b.linhas - 1) * b.entrelinha;
      const abaixo = p.blocos.filter(o => o !== b && o.y - o.tam * 0.92 > fimOriginal && o.x < b.x + largPt && o.x + o.largura > b.x && String(textos[o.id] ?? o.texto).trim())
        .reduce((m, o) => Math.min(m, o.y - o.tam * 0.92), p.h * 0.98);
      const livre = abaixo - (b.y - b.tam * 0.92) - b.tam * 0.15;
      const letra = b.largura * b.linhas / Math.max(1, b.texto.length);
      const entre = b.linhas > 1 ? b.entrelinha : b.tam * 1.2;
      const altura = e => ((quebra ? Math.max(b.linhas, Math.ceil(String(texto).length * letra * e / (largPt * 0.97))) : 1) - 1) * entre * e + b.tam * 1.2 * e;
      // Texto que quebra: a palavra mais longa precisa caber inteira na largura (sem cortar no meio).
      // (com folga para fonte substituta mais larga no computador de quem abre: até ~0,62 do tamanho por letra em negrito)
      const palavraMaior = Math.max(...String(texto).split(/\s+/).map(w => w.length));
      const letraSegura = Math.max(letra, b.tam * (b.negrito ? 0.62 : 0.56));
      if (quebra && palavraMaior * letraSegura * escala > largPt * 0.97) escala = Math.max(0.75, Math.floor(largPt * 0.97 / (palavraMaior * letraSegura) * 100) / 100);
      while (escala > 0.8 && altura(escala) > Math.max(livre, b.tam * 1.2 * escala)) escala = Math.max(0.8, Math.round((escala - 0.03) * 100) / 100);
      const alt = Math.max(((b.linhas - 1) * b.entrelinha + b.tam * 1.25) * PT * sy, altura(escala) * PT * sy);
      const spc = b.espacado ? ` spc="${Math.round(b.tam * 14)}"` : '';   // rótulo com espaçamento entre letras
      const rpr = `<a:rPr lang="pt-BR" sz="${Math.round(b.tam * 100 * escala)}"${b.negrito ? ' b="1"' : ''}${spc} dirty="0"><a:solidFill><a:srgbClr val="${b.cor.slice(1)}"/></a:solidFill><a:latin typeface="${x(b.fonte)}"/><a:cs typeface="${x(b.fonte)}"/></a:rPr>`;
      // Marcador de lista com cor/peso próprios: um trecho só para ele (o texto adaptado pode vir com ou sem o marcador).
      const mk = b.marcador && /^\s*([•◦▪▫●○■□‣⁃–—\-*✓✔☐☑➢➤►▶→]|\d{1,2}[.)])\s+/.exec(String(texto));
      const runs = mk ? `<a:r>${rpr.replace(/ b="1"/, '').replace(' sz=', `${b.marcador.negrito ? ' b="1"' : ''} sz=`).replace(/srgbClr val="[0-9A-F]{6}"/i, `srgbClr val="${b.marcador.cor.slice(1)}"`)}<a:t>${x(mk[1])} </a:t></a:r><a:r>${rpr}<a:t>${x(String(texto).slice(mk[0].length))}</a:t></a:r>`
        : `<a:r>${rpr}<a:t>${x(b.espacado ? String(texto).replace(/ +/g, '  ') : texto)}</a:t></a:r>`;   // rótulo espaçado: palavras bem separadas
      const lnSpc = b.linhas > 1 ? `<a:lnSpc><a:spcPts val="${Math.round(b.entrelinha * escala * 100)}"/></a:lnSpc>` : '';
      return `<p:sp><p:nvSpPr><p:cNvPr id="${k + 3}" name="Texto ${x(b.id)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(esq)}" y="${Math.round(Math.max(0, topo))}"/><a:ext cx="${Math.round(larg)}" cy="${Math.round(alt)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="${quebra ? 'square' : 'none'}" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t">${quebra ? '<a:spAutoFit/>' : '<a:noAutofit/>'}</a:bodyPr><a:lstStyle/><a:p><a:pPr>${lnSpc}</a:pPr>${runs}</a:p></p:txBody></p:sp>`;
    }).join('');
    const bg = nativo && fn.cor ? `<p:bg><p:bgPr>${preenchimento(fn.cor)}<a:effectLst/></p:bgPr></p:bg>` : '';
    return `${XML}<p:sld ${P}><p:cSld>${bg}<p:spTree>${ARVORE}${fundo}${caixas}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  });
  const apresentacao = `${XML}<p:presentation ${P} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${xmls.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr lang="pt-BR"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`;
  const fontes = [...new Set(paginas.flatMap(p => p.blocos.map(b => b.fonte)))];
  const corTema = paginas.flatMap(p => p.blocos.map(b => b.cor)).find(c => c && !/^#(000000|FFFFFF)$/.test(c))?.slice(1) || VERDE_PADRAO;
  return zipar([
    { nome: '[Content_Types].xml', dados: tipos('<Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>', [['/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'], ['/ppt/slideMasters/slideMaster1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'], ['/ppt/slideLayouts/slideLayout1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'], ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'], ['/ppt/presProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml'], ['/ppt/viewProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml'], ['/ppt/tableStyles.xml', 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml'], ...xmls.map((_, i) => [`/ppt/slides/slide${i + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'])]) },
    { nome: '_rels/.rels', dados: relsRaiz('ppt/presentation.xml') },
    { nome: 'ppt/presentation.xml', dados: apresentacao },
    { nome: 'ppt/_rels/presentation.xml.rels', dados: rels([['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ...xmls.map((_, i) => [`rId${i + 3}`, 'slide', `slides/slide${i + 1}.xml`]), [`rId${xmls.length + 3}`, 'presProps', 'presProps.xml'], [`rId${xmls.length + 4}`, 'viewProps', 'viewProps.xml'], [`rId${xmls.length + 5}`, 'tableStyles', 'tableStyles.xml']]) },
    { nome: 'ppt/presProps.xml', dados: `${XML}<p:presentationPr ${P}/>` },
    { nome: 'ppt/viewProps.xml', dados: `${XML}<p:viewPr ${P}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>` },
    { nome: 'ppt/tableStyles.xml', dados: `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` },
    { nome: 'ppt/slideMasters/slideMaster1.xml', dados: MESTRE },
    { nome: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', dados: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
    { nome: 'ppt/slideLayouts/slideLayout1.xml', dados: LAYOUT },
    { nome: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', dados: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { nome: 'ppt/theme/theme1.xml', dados: TEMA(corTema, x(fontes[0] || 'Calibri')) },
    ...xmls.flatMap((s, i) => Array.isArray(paginas[i].elementos)
      ? [{ nome: `ppt/slides/slide${i + 1}.xml`, dados: s }, { nome: `ppt/slides/_rels/slide${i + 1}.xml.rels`, dados: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ...relsSlide[i].map(r => [r.id, 'image', r.alvo])]) }]
      : [{ nome: `ppt/slides/slide${i + 1}.xml`, dados: s }, { nome: `ppt/slides/_rels/slide${i + 1}.xml.rels`, dados: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'image', `../media/fundo${i + 1}.jpg`]]) }, { nome: `ppt/media/fundo${i + 1}.jpg`, dados: paginas[i].fundo }]),
    ...[...midias.values()].map(m => ({ nome: `ppt/media/${m.nome}`, dados: m.dados })),
    { nome: 'docProps/core.xml', dados: core(titulo, agora) },
    { nome: 'docProps/app.xml', dados: app('GreenIA') },
  ]);
}
