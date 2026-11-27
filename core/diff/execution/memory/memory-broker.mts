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
  readonly failure?: string;
};

type Lease = { cancelled: boolean; release: Release | undefined; granting?: Promise<void> };

export type Ledger = { readonly semaphore: Semaphore; readonly capacity: number };

export type LeaseSocket = { readonly destroyed: boolean; write(text: string): unknown };

type Request = { readonly socket: LeaseSocket; readonly id: number; readonly lease: Lease };

type Address = { readonly address: string; readonly folder?: string } | { readonly failed: string };

const NO_BROKER: MemoryBroker = { environment: {}, close: () => Promise.resolve() };

function endLease(lease: Lease | undefined): void {
  if (lease === undefined) {
    return;
  }
  lease.cancelled = true;
  lease.release?.();
  lease.release = undefined;
}

async function admit(
  { socket, id, lease }: Request,
  ledger: Ledger,
  weight: number,
): Promise<void> {
  const release = await ledger.semaphore.acquire(Math.min(weight, ledger.capacity));
  if (lease.cancelled || socket.destroyed) {
    release();
    return;
  }
  lease.release = release;
  socket.write(`${JSON.stringify({ id })}\n`);
}

export type LeaseRequests = { readonly handle: (line: string) => void; readonly close: () => void };

export function leaseRequests(socket: LeaseSocket, ledger: Ledger): LeaseRequests {
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
      lease.granting = admit({ socket, id, lease }, ledger, Math.max(0, Math.floor(megabytes)));
      return;
    }
    endLease(leases.get(id));
    leases.delete(id);
  }
  return {
    handle: (line) => {
      handle(parseJson(line));
    },
    close: () => {
      for (const lease of leases.values()) {
        endLease(lease);
      }
      leases.clear();
    },
  };
}

function serve(socket: Socket, ledger: Ledger): void {
  const requests = leaseRequests(socket, ledger);
  socket.setEncoding('utf8');
  socket.on('data', messageLines(requests.handle));
  socket.on('error', () => undefined);
  socket.on('close', requests.close);
}

async function brokerAddress(): Promise<Address> {
  if (process.platform === 'win32') {
    const name = `nitpicker-memory-${String(process.pid)}-${String(Date.now())}`;
    return { address: path.join('\\\\?\\pipe', name) };
  }
  try {
    const folder = await mkdtemp(path.join(tmpdir(), 'nitpicker-mb-'));
    return { address: path.join(folder, 's'), folder };
  } catch (error) {
    return { failed: String(error) };
  }
}

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
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
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
  const chosen = await brokerAddress();
  if ('failed' in chosen) {
    return { ...NO_BROKER, failure: chosen.failed };
  }
  try {
    await listening(server, chosen.address);
  } catch (error) {
    await removeFolder(chosen.folder);
    return { ...NO_BROKER, failure: String(error) };
  }
  server.unref();
  return {
    environment: { [MEMORY_BROKER_VARIABLE]: chosen.address },
    close: async () => {
      await closeServer(server, sockets);
      await removeFolder(chosen.folder);
    },
  };
}
