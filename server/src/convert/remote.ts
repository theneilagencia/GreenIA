// Conversor remoto: o servidor (API e fila) não roda ferramenta nenhuma; envia os
// bytes ao serviço de conversão (service.ts), que roda isolado e sem rede.
import { ConversionError, type Converter, type Isolamento, type OcrPage, type OfficeKind } from './converter.ts';

type PaginaJson = Omit<OcrPage, 'image'> & { image?: string };
const deB64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

export class RemoteConverter implements Converter {
  private url: string;
  private token: string;
  private timeoutS: number;
  constructor(opts: { url: string; token: string; timeoutS: number }) {
    if (!opts.token || opts.token.length < 32) throw new Error('CONVERTER_TOKEN (32+ caracteres) é obrigatório com CONVERTER_URL');
    this.url = opts.url.replace(/\/+$/, '');
    this.token = opts.token;
    this.timeoutS = opts.timeoutS;
  }

  private async chamar(caminho: string, corpo?: Uint8Array, paginas = 1): Promise<Response> {
    let r: Response;
    try {
      r = await fetch(this.url + caminho, {
        method: corpo ? 'POST' : 'GET',
        headers: { authorization: `Bearer ${this.token}`, ...(corpo ? { 'content-type': 'application/octet-stream' } : {}) },
        body: corpo ? Buffer.from(corpo) : undefined,
        // Mesmo tempo que a conversão local, com folga para a transferência.
        signal: AbortSignal.timeout((this.timeoutS + 20 * Math.max(1, paginas) + 30) * 1000),
      });
    } catch (e) {
      throw new ConversionError(`serviço de conversão indisponível (${(e as Error).name === 'TimeoutError' ? 'tempo esgotado' : 'sem resposta'})`);
    }
    if (r.status === 422) throw new ConversionError(((await r.json().catch(() => ({}))) as { mensagem?: string }).mensagem ?? 'conversão recusada');
    if (!r.ok) throw new ConversionError(`serviço de conversão respondeu ${r.status}`);
    return r;
  }

  private paginas(ps: PaginaJson[]): OcrPage[] { return ps.map(p => ({ ...p, image: p.image ? deB64(p.image) : undefined })); }

  async available() {
    try {
      const d = await (await this.chamar('/v1/disponivel')).json() as { ocr: boolean; images: boolean; office: boolean };
      return { ocr: !!d.ocr, images: !!d.images, office: !!d.office };
    } catch { return { ocr: false, images: false, office: false }; }
  }

  async isolamento(): Promise<Isolamento & { remoto: true }> {
    const d = await (await this.chamar('/v1/disponivel')).json().catch(() => ({})) as { isolamento?: Isolamento };
    return { rede: !!d.isolamento?.rede, limites: !!d.isolamento?.limites, ambienteLimpo: true, remoto: true };
  }

  async ocrPdf(bytes: Uint8Array, pages?: number[]) {
    const q = pages?.length ? `?paginas=${pages.join(',')}` : '';
    return this.paginas(((await (await this.chamar(`/v1/ocr-pdf${q}`, bytes, pages?.length ?? 10)).json()) as { paginas: PaginaJson[] }).paginas);
  }

  async ocrImage(bytes: Uint8Array) {
    return this.paginas(((await (await this.chamar('/v1/ocr-imagem', bytes)).json()) as { paginas: PaginaJson[] }).paginas);
  }

  async imageToJpeg(bytes: Uint8Array) {
    return ((await (await this.chamar('/v1/imagem-jpeg', bytes)).json()) as { imagens: string[] }).imagens.map(deB64);
  }

  async officeToOoxml(bytes: Uint8Array, from: OfficeKind) {
    return new Uint8Array(await (await this.chamar(`/v1/office?de=${from}`, bytes)).arrayBuffer());
  }
}
