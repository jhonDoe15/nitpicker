import { connect } from 'node:net';
import type { Release, Semaphore } from '../capacity.mts';
import { fieldOf, parseJson } from '../../../../shared/values/readers.mts';
import { MEMORY_BROKER_VARIABLE } from './memory-broker.mts';
import { messageLines } from './message-lines.mts';

type Environment = Readonly<Record<string, string | undefined>>;

export type BrokerSocket = {
  setEncoding(encoding: BufferEncoding): unknown;
  on(event: string, listener: (chunk: string) => void): unknown;
  ref(): unknown;
  unref(): unknown;
  write(text: string): unknown;
  destroy(): unknown;
};

type Connect = (address: string) => BrokerSocket;

type Connection = {
  socket: BrokerSocket | undefined;
  lost: boolean;
  nextId: number;
  readonly waiting: Map<number, () => void>;
};

function unlimited(): void {
  return undefined;
}

function settleWaiting({ socket, waiting }: Connection): void {
  if (waiting.size > 0) {
    socket?.ref();
  } else {
    socket?.unref();
  }
}

function loseConnection(connection: Connection): void {
  connection.lost = true;
  const granted = [...connection.waiting.values()];
  connection.waiting.clear();
  for (const resolve of granted) {
    resolve();
  }
  connection.socket?.destroy();
}

function onGranted(connection: Connection, line: string): void {
  const id = fieldOf(parseJson(line), 'id');
  const resolve = typeof id === 'number' ? connection.waiting.get(id) : undefined;
  if (typeof id !== 'number' || resolve === undefined) {
    return;
  }
  connection.waiting.delete(id);
  settleWaiting(connection);
  resolve();
}

function opened(connection: Connection, socket: BrokerSocket): BrokerSocket {
  socket.setEncoding('utf8');
  socket.on(
    'data',
    messageLines((line) => {
      onGranted(connection, line);
    }),
  );
  socket.on('error', () => {
    loseConnection(connection);
  });
  socket.on('close', () => {
    loseConnection(connection);
  });
  return socket;
}

function releaseOnce(connection: Connection, id: number): Release {
  let released = false;
  return () => {
    if (released || connection.lost) {
      return;
    }
    released = true;
    connection.socket?.write(`${JSON.stringify({ id, release: true })}\n`);
  };
}

export function brokerSemaphore(address: string, open: Connect = connect): Semaphore {
  const connection: Connection = { socket: undefined, lost: false, nextId: 1, waiting: new Map() };
  return {
    acquire(weight: number): Promise<Release> {
      if (weight === 0 || connection.lost) {
        return Promise.resolve(unlimited);
      }
      connection.socket ??= opened(connection, open(address));
      const id = connection.nextId;
      connection.nextId += 1;
      return new Promise((resolve) => {
        connection.waiting.set(id, () => {
          resolve(connection.lost ? unlimited : releaseOnce(connection, id));
        });
        settleWaiting(connection);
        connection.socket?.write(`${JSON.stringify({ id, acquire: weight })}\n`);
      });
    },
  };
}

export function sharedMemoryOf(environment: Environment): Semaphore | undefined {
  const address = environment[MEMORY_BROKER_VARIABLE];
  return address === undefined || address === '' ? undefined : brokerSemaphore(address);
}
