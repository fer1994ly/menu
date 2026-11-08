import { bulkPut, type AppDb } from '@/shared/infrastructure/db';
import type { ClientsRepository } from '../application/ports';
import type { Client } from '../domain/client';

export class IdbClientsRepository implements ClientsRepository {
  constructor(private readonly db: AppDb) {}

  get(id: string): Promise<Client | undefined> {
    return this.db.get('clients', id);
  }

  list(): Promise<Client[]> {
    return this.db.getAll('clients');
  }

  count(): Promise<number> {
    return this.db.count('clients');
  }

  putMany(clients: readonly Client[]): Promise<void> {
    return bulkPut(this.db, 'clients', clients);
  }
}
