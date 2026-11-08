import type { Client } from '../domain/client';

export interface ClientsRepository {
  get(id: string): Promise<Client | undefined>;
  list(): Promise<Client[]>;
  count(): Promise<number>;
  putMany(clients: readonly Client[]): Promise<void>;
}
