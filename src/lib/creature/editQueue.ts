/**
 * Serialized write-behind queue for the Creature Lab.
 *
 * The Lab applies every tap locally first (applyTool + buildModel), so the
 * creature reacts instantly; this queue then sends the same tool calls to
 * POST /api/designs/[id]/edit strictly one request at a time, in tap order.
 *
 * - One user action = one history entry, so one Undo tap reverts a whole action
 *   (a Shuffle included) even if the server had to store it in more than one
 *   revision (the edit route caps calls per request; the remainder is re-sent).
 * - Actions pushed with the same `coalesce` key while still waiting in the queue
 *   are merged (last one wins), e.g. fast name-reel spins become one revision.
 * - Any failure or server-side rejection means the optimistic state may differ
 *   from the server, so the queue is dropped and `onDesync` asks for a reload.
 */
import type { ToolCall } from "../edit/tools";

export interface EditResult {
  applied: string[];
  rejected: string[];
}

export interface EditQueueDeps {
  send(calls: ToolCall[]): Promise<EditResult>;
  undo(): Promise<void>;
  onDesync(): void;
  /** Called whenever the number of undoable actions changes. */
  onChange?(): void;
}

interface Entry {
  revisions: number;
}

interface Job {
  calls: ToolCall[];
  coalesce?: string;
  entry: Entry;
}

export class EditQueue {
  private jobs: Job[] = [];
  private running = false;
  private history: Entry[] = [];
  private waiters: (() => void)[] = [];

  constructor(private deps: EditQueueDeps) {}

  /** Number of user actions this session that one Undo tap each can revert. */
  get undoable(): number {
    return this.history.length;
  }

  get busy(): boolean {
    return this.running || this.jobs.length > 0;
  }

  /**
   * Queue one user action. `coalesce`: merge into a still-waiting action with the
   * same key (last wins). `record: false` keeps it out of the Undo history (the
   * starter creature, so Undo never goes back to a blank template).
   */
  push(calls: ToolCall[], opts: { coalesce?: string; record?: boolean } = {}): void {
    if (!calls.length) return;
    const { coalesce, record = true } = opts;
    const last = this.jobs[this.jobs.length - 1];
    if (coalesce && last && last.coalesce === coalesce) {
      last.calls = calls;
      return;
    }
    const entry: Entry = { revisions: 0 };
    if (record) this.history.push(entry);
    this.jobs.push({ calls, coalesce, entry });
    this.deps.onChange?.();
    void this.pump();
  }

  /** Resolves once every queued edit has been sent (or dropped after a failure). */
  idle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /**
   * Revert the most recent user action. Waits for pending writes first.
   * With an empty history, `fallback` revisions are undone instead (0 = nothing).
   * Returns true when something was undone on the server.
   */
  async undo(fallback = 0): Promise<boolean> {
    await this.idle();
    let entry = this.history.pop();
    while (entry && entry.revisions === 0) entry = this.history.pop();
    const n = entry ? entry.revisions : fallback;
    this.deps.onChange?.();
    for (let i = 0; i < n; i++) await this.deps.undo();
    return n > 0;
  }

  /** Forget history (after the Lab reloads the design from the server). */
  reset(): void {
    this.jobs = [];
    this.history = [];
    this.deps.onChange?.();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    let desync = false;
    try {
      while (this.jobs.length) {
        const job = this.jobs.shift()!;
        let rest = job.calls;
        while (rest.length) {
          const r = await this.deps.send(rest);
          const handled = r.applied.length + r.rejected.length;
          if (r.applied.length) job.entry.revisions++;
          if (r.rejected.length) desync = true;
          if (handled <= 0) {
            desync = true;
            break;
          }
          rest = rest.slice(handled);
        }
      }
    } catch {
      desync = true;
    } finally {
      this.running = false;
      if (desync) {
        this.jobs = [];
        this.history = [];
        this.deps.onChange?.();
        this.deps.onDesync();
      }
      const w = this.waiters;
      this.waiters = [];
      w.forEach((resolve) => resolve());
    }
  }
}
