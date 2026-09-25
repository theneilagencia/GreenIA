// Ponto de entrada do serviço de conversão (tarefa própria, sem saída de rede e
// sem banco, Redis ou chave do modelo). Só lê a configuração das conversões.
//   node src/converter-main.ts
import { z } from 'zod';
import { LocalConverter } from './convert/converter.ts';
import { buildConverterService } from './convert/service.ts';

const cfg = z.object({
  CONVERTER_TOKEN: z.string().min(32),
  CONVERTER_PORT: z.coerce.number().int().default(8081),
  HOST: z.string().default('0.0.0.0'),
  CONVERTER_BODY_LIMIT_MB: z.coerce.number().int().min(1).max(300).default(100),
  OCRMYPDF_CMD: z.string().default('ocrmypdf'),
  OCR_LANG: z.string().default('por'),
  MAGICK_CMD: z.string().default('convert'),
  SOFFICE_CMD: z.string().default('soffice'),
  CONVERT_TIMEOUT_S: z.coerce.number().int().min(10).max(3600).default(120),
  CONVERT_ISOLATION: z.enum(['auto', 'required', 'off']).default('auto'),
  CONVERT_MEM_MB: z.coerce.number().int().min(256).max(16384).default(2048),
  CONVERT_FILE_MB: z.coerce.number().int().min(16).max(16384).default(1024),
}).parse(process.env);

const conv = new LocalConverter(cfg);
// O segredo já foi lido: não fica no ambiente que as ferramentas poderiam herdar.
delete process.env.CONVERTER_TOKEN;
const app = await buildConverterService(conv, { token: cfg.CONVERTER_TOKEN, bodyLimitMb: cfg.CONVERTER_BODY_LIMIT_MB, log: true });
const stop = async () => { await app.close(); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
await app.listen({ port: cfg.CONVERTER_PORT, host: cfg.HOST });
