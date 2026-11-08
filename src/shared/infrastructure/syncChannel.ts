import type { EventEntity } from '@/features/history/domain/event';

export const SYNC_CHANNEL_NAME = 'privee-food-sync';

export type SyncMessageType = 'changed' | 'conflict' | 'reset';

/** What a tab announces to the others after saving. */
export interface SyncMessage {
  type: SyncMessageType;
  entity: EventEntity | 'all';
  id: string;
  /** Order version after the save; 0 for entities without versions. */
  version: number;
  /** Epoch ms of the save. */
  savedAt: number;
  tabId: string;
}

export interface SyncBus {
  publish(message: SyncMessage): void;
  /** Messages from OTHER tabs only. Returns the unsubscribe function. */
  subscribe(listener: (message: SyncMessage) => void): () => void;
  close(): void;
}

/** Real cross-tab bus over `BroadcastChannel` (a tab never receives its own messages). */
export class BroadcastChannelBus implements SyncBus {
  private readonly channel: BroadcastChannel;
  private readonly listeners = new Set<(message: SyncMessage) => void>();

  constructor(name: string = SYNC_CHANNEL_NAME) {
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      for (const listener of this.listeners) listener(event.data);
    };
  }

  publish(message: SyncMessage): void {
    this.channel.postMessage(message);
  }

  subscribe(listener: (message: SyncMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    this.channel.close();
  }
}

/** Bus that goes nowhere, for environments without BroadcastChannel. */
export class NullSyncBus implements SyncBus {
  publish(): void {}
  subscribe(): () => void {
    return () => undefined;
  }
  close(): void {}
}

/** Test double: every connection receives what the OTHER connections publish. */
export class InMemorySyncHub {
  private readonly buses = new Set<InMemorySyncBus>();

  connect(): SyncBus {
    const bus = new InMemorySyncBus(this);
    this.buses.add(bus);
    return bus;
  }

  broadcast(from: InMemorySyncBus, message: SyncMessage): void {
    for (const bus of this.buses) if (bus !== from) bus.deliver(message);
  }

  detach(bus: InMemorySyncBus): void {
    this.buses.delete(bus);
  }
}

class InMemorySyncBus implements SyncBus {
  private readonly listeners = new Set<(message: SyncMessage) => void>();

  constructor(private readonly hub: InMemorySyncHub) {}

  publish(message: SyncMessage): void {
    this.hub.broadcast(this, message);
  }

  subscribe(listener: (message: SyncMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  deliver(message: SyncMessage): void {
    for (const listener of this.listeners) listener(message);
  }

  close(): void {
    this.listeners.clear();
    this.hub.detach(this);
  }
}

export function createSyncBus(): SyncBus {
  return typeof BroadcastChannel === 'undefined' ? new NullSyncBus() : new BroadcastChannelBus();
}
