// Batch operations as jobs the task center lists: registered on the server before they start, each target reported as
// it finishes, then finished (or canceled). A target that failed carries a code the task center words (or the text an
// engine gave). Reporting never stops the operation itself: a lost report only leaves the job's record short.
import { folio, type JobDetail, type JobKind } from './api';

export interface JobTarget { targetId: string; name: string }
export interface JobRun {
  id: string;
  // The job's number for a target, by its id.
  seq(targetId: string): number | undefined;
  report(targetId: string, error: string | null): Promise<void>;
  finish(canceled?: boolean): Promise<void>;
}

export function jobRun(j: JobDetail): JobRun {
  const seqs = new Map(j.items.map(i => [i.targetId ?? '', i.seq]));
  return {
    id: j.id,
    seq: targetId => seqs.get(targetId),
    async report(targetId, error){
      const seq = seqs.get(targetId);
      if (seq) await folio.api('POST', `/jobs/${j.id}/results`, { results: [{ seq, ok: !error, error }] }).catch(() => {});
    },
    async finish(canceled = false){ await folio.api('POST', `/jobs/${j.id}/finish`, { canceled }).catch(() => {}); }
  };
}

// A new job for these targets; null when the server couldn't be told (the operation goes ahead unrecorded).
export async function startJob(wsId: string, kind: JobKind, targets: JobTarget[], detail: Record<string, unknown> = {}): Promise<JobRun | null> {
  try { return jobRun(await folio.api<JobDetail>('POST', `/workspaces/${wsId}/jobs`, { kind, detail, items: targets })); } catch { return null; }
}

// Its failed targets (or just the ones given) back to waiting; resolves with the job as it is now, to run them again.
export async function retryJob(id: string, seqs?: number[]){
  return folio.api<JobDetail>('POST', `/jobs/${id}/retry`, seqs ? { seqs } : {});
}
