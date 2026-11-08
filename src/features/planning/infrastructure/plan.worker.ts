/// <reference lib="webworker" />
import { runPlanJob, type WorkerRequest, type WorkerResponse } from '../application/planJob';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, job } = event.data;
  let response: WorkerResponse;
  try {
    response = { id, result: runPlanJob(job) };
  } catch (error) {
    response = { id, error: error instanceof Error ? error.message : 'Plan job failed' };
  }
  scope.postMessage(response);
};
