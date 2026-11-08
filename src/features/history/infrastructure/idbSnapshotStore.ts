import type { AppDb } from '@/shared/infrastructure/db';
import type { SnapshotStore } from '../application/ports';
import type { StateSnapshot } from '../domain/snapshot';

export class IdbSnapshotStore implements SnapshotStore {
  constructor(private readonly db: AppDb) {}

  async put(snapshot: StateSnapshot): Promise<void> {
    await this.db.put('snapshots', snapshot);
  }

  get(id: string): Promise<StateSnapshot | undefined> {
    return this.db.get('snapshots', id);
  }

  async latestAtOrBefore(atMs: number): Promise<StateSnapshot | undefined> {
    const tx = this.db.transaction('snapshots', 'readonly');
    const cursor = await tx.store.index('takenAt').openCursor(IDBKeyRange.upperBound(atMs), 'prev');
    return cursor?.value;
  }

  count(): Promise<number> {
    return this.db.count('snapshots');
  }
}
