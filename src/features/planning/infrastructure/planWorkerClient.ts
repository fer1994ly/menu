import { runPlanJob, type PlanJob, type PlanJobResult, type WorkerRequest, type WorkerResponse } from '../application/planJob';
import type { PlanRunner, WeekPlanInput } from '../application/ports';
import type { PlanInput } from '../domain/planProduction';

type Pending = { resolve: (result: PlanJobResult) => void; reject: (error: Error) => void };

function expectKind<K extends PlanJobResult['kind']>(result: PlanJobResult, kind: K): Extract<PlanJobResult, { kind: K }> {
  if (result.kind !== kind) throw new Error(`Unexpected plan job result "${result.kind}"`);
  return result as Extract<PlanJobResult, { kind: K }>;
}

/** Typed client over the plan Web Worker. */
export class WorkerPlanRunner implements PlanRunner {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL('./plan.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const entry = this.pending.get(response.id);
      if (!entry) return;
      this.pending.delete(response.id);
      if ('error' in response) entry.reject(new Error(response.error));
      else entry.resolve(response.result);
    };
    this.worker.onerror = (event) => {
      for (const entry of this.pending.values()) entry.reject(new Error(event.message || 'Plan worker failed'));
      this.pending.clear();
    };
  }

  private run(job: PlanJob): Promise<PlanJobResult> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const request: WorkerRequest = { id, job };
      this.worker.postMessage(request);
    });
  }

  async planWeek(input: PlanInput) {
    const { result, elapsedMs } = expectKind(await this.run({ kind: 'planWeek', input }), 'planWeek');
    return { result, elapsedMs };
  }

  async recalculateHistory(inputs: readonly WeekPlanInput[]) {
    const { results, elapsedMs } = expectKind(await this.run({ kind: 'recalculateHistory', inputs }), 'recalculateHistory');
    return { results, elapsedMs };
  }

  dispose(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}

const CHUNK_SIZE = 4;
const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Fallback where Workers do not exist (jsdom, very old browsers): chunks of work between timeouts. */
export class InlinePlanRunner implements PlanRunner {
  async planWeek(input: PlanInput) {
    await yieldToEventLoop();
    const { result, elapsedMs } = expectKind(runPlanJob({ kind: 'planWeek', input }), 'planWeek');
    return { result, elapsedMs };
  }

  async recalculateHistory(inputs: readonly WeekPlanInput[]) {
    const results = [];
    let elapsedMs = 0;
    for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
      await yieldToEventLoop();
      const job = expectKind(runPlanJob({ kind: 'recalculateHistory', inputs: inputs.slice(i, i + CHUNK_SIZE) }), 'recalculateHistory');
      results.push(...job.results);
      elapsedMs += job.elapsedMs;
    }
    return { results, elapsedMs };
  }

  dispose(): void {}
}

/** A Web Worker when the browser has them, the inline fallback otherwise. */
export function createPlanRunner(): PlanRunner {
  if (typeof Worker === 'undefined') return new InlinePlanRunner();
  try {
    return new WorkerPlanRunner();
  } catch {
    return new InlinePlanRunner();
  }
}
