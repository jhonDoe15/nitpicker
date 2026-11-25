import { mkdtemp, rm } from 'node:fs/promises';
import { type Server, type Socket, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type Release, type Semaphore, createWeightedSemaphore } from '../capacity.mts';
import { fieldOf, parseJson } from '../../../../shared/values/readers.mts';
import { messageLines } from './message-lines.mts';

export const MEMORY_BROKER_VARIABLE = 'NITPICKER_MEMORY_BROKER';

export type MemoryBroker = {
  readonly environment: Readonly<Record<string, string>>;
  readonly close: () => Promise<void>;
};

type Lease = { cancelled: boolean; release: Release | undefined };

type Ledger = { readonly semaphore: Semaphore; readonly capacity: number };

function endLease(lease: Lease | undefined): void {
  if (lease === undefined) {
    return;
  }
  lease.cancelled = true;
  lease.release?.();
  lease.release = undefined;
}

function grant(socket: Socket, id: number, lease: Lease, release: Release): void {
  if (lease.cancelled || socket.destroyed) {
    release();
    return;
  }
  lease.release = release;
  socket.write(`${JSON.stringify({ id })}\n`);
}

function serve(socket: Socket, { semaphore, capacity }: Ledger): void {
  const leases = new Map<number, Lease>();
  function handle(message: unknown): void {
    const id = fieldOf(message, 'id');
    const megabytes = fieldOf(message, 'acquire');
    if (typeof id !== 'number') {
      return;
    }
    if (typeof megabytes === 'number') {
      const lease: Lease = { cancelled: false, release: undefined };
      leases.set(id, lease);
      const weight = Math.min(Math.max(0, Math.floor(megabytes)), capacity);
      void semaphore.acquire(weight).then((release) => {
        grant(socket, id, lease, release);
      });
      return;
    }
    endLease(leases.get(id));
    leases.delete(id);
  }
  socket.setEncoding('utf8');
  socket.on(
    'data',
    messageLines((line) => {
      handle(parseJson(line));
    }),
  );
  socket.on('error', () => undefined);
  socket.on('close', () => {
    for (const lease of leases.values()) {
      endLease(lease);
    }
    leases.clear();
  });
}

async function brokerAddress(): Promise<{ readonly address: string; readonly folder?: string }> {
  if (process.platform === 'win32') {
    const name = `nitpicker-memory-${String(process.pid)}-${String(Date.now())}`;
    return { address: path.join('\\\\?\\pipe', name) };
  }
  const folder = await mkdtemp(path.join(tmpdir(), 'nitpicker-mb-'));
  return { address: path.join(folder, 's'), folder };
}

const NO_BROKER: MemoryBroker = { environment: {}, close: () => Promise.resolve() };

function listening(server: Server, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(address, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function removeFolder(folder: string | undefined): Promise<void> {
  if (folder !== undefined) {
    await rm(folder, { recursive: true, force: true });
  }
}

function closeServer(server: Server, sockets: ReadonlySet<Socket>): Promise<void> {
  for (const socket of sockets) {
    socket.destroy();
  }
  return new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

export async function startMemoryBroker(capacityMegabytes: number): Promise<MemoryBroker> {
  const ledger = {
    semaphore: createWeightedSemaphore(capacityMegabytes),
    capacity: capacityMegabytes,
  };
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    serve(socket, ledger);
  });
  const { address, folder } = await brokerAddress().catch(() => ({
    address: undefined,
    folder: undefined,
  }));
  if (address === undefined) {
    return NO_BROKER;
  }
  try {
    await listening(server, address);
  } catch {
    await removeFolder(folder);
    return NO_BROKER;
  }
  server.unref();
  return {
    environment: { [MEMORY_BROKER_VARIABLE]: address },
    close: async () => {
      await closeServer(server, sockets);
      await removeFolder(folder);
    },
  };
}
