// Fila de tarefas longas (indexação de documentos, limpeza da retenção).
// Produção: BullMQ + Redis. Testes: execução imediata, na mesma chamada.
import { Queue, Worker, type ConnectionOptions } from 'bullmq';

export type JobHandler = (data: Record<string, unknown>) => Promise<void>;

export interface JobQueue {
  enqueue(name: string, data: Record<string, unknown>): Promise<void>;
  register(name: string, handler: JobHandler): void;
  close(): Promise<void>;
}

export class BullJobQueue implements JobQueue {
  private queue: Queue;
  private handlers = new Map<string, JobHandler>();
  private worker?: Worker;
  private connection: ConnectionOptions;

  constructor(redisUrl: string, name = 'greenia') {
    const u = new URL(redisUrl);
    this.connection = { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined, tls: u.protocol === 'rediss:' ? {} : undefined };
    this.queue = new Queue(name, { connection: this.connection });
  }

  async enqueue(name: string, data: Record<string, unknown>) {
    await this.queue.add(name, data, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 });
  }

  register(name: string, handler: JobHandler) { this.handlers.set(name, handler); }

  // Liga o processamento neste processo (o mesmo servidor ou um processo só de fila).
  startWorker(concurrency = 2) {
    this.worker = new Worker(this.queue.name, async job => {
      const h = this.handlers.get(job.name);
      if (!h) throw new Error('tarefa sem responsável: ' + job.name);
      await h(job.data);
    }, { connection: this.connection, concurrency });
  }

  // Tarefa periódica (ex.: limpeza da retenção).
  async repeat(name: string, everyMs: number) {
    await this.queue.upsertJobScheduler(name, { every: everyMs }, { name, data: {} });
  }

  async close() { await this.worker?.close(); await this.queue.close(); }
}

export class InlineJobQueue implements JobQueue {
  private handlers = new Map<string, JobHandler>();
  ran: { name: string; data: Record<string, unknown> }[] = [];
  register(name: string, handler: JobHandler) { this.handlers.set(name, handler); }
  async enqueue(name: string, data: Record<string, unknown>) {
    this.ran.push({ name, data });
    const h = this.handlers.get(name);
    if (h) await h(data);
  }
  async close() {}
}
