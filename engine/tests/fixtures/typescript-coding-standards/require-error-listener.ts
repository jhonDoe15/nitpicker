import net, { connect as dial, createServer } from 'node:net';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';
import * as events from 'events';
import { createInterface } from 'readline';
import tls = require('tls');
const zlib = require('zlib');
const { createReadStream: crs } = require('node:fs');
import WebSocket from 'ws';
import { Client, Pool } from 'pg';
import { Worker } from 'worker_threads';
import { StreamableFile } from '@nestjs/common';

const a = net.connect(80);
const b = dial(81);
const c = net.connect(82) as net.Socket;
const d = net.connect(83)!;
const e = net.connect(84).setTimeout(1);
const f = net.connect(85).on('error', () => {});
const g = net.connect(86).setTimeout(1).on('error', () => {});
let h;
h = net.connect(87);
h ||= net.connect(88);
let i = cond ? net.connect(1) : null;
const j = cond && net.connect(2);
const k = (await import('node:net')).connect(3);
const l = require('net').connect(4);
const m = net.connect.bind(net)(5);
const bound = net.connect;
const n = bound(6);
const o = crs('x');
const p = zlib.createGzip();
const q = new WebSocket('ws://x');
const r = new Client();
const s = new Pool();
const t = new Worker('x');
const u = new net.Socket();
const v = tls.connect(1);
export const w = net.connect(9);
const x = net.connect(10);
x.on('error', () => {});
const y = net.connect(11);
y.once?.('error', () => {});
const z = net.connect(12);
pipeline(z, fs.createWriteStream('o'));
const a1 = net.connect(13);
await once(a1, 'close');
const a2 = net.connect(14);
for await (const chunk of a2) {}
const a3 = net.connect(15);
const holder = { sock: a3 };
const a4 = net.connect(16);
const arr = [a4];
const a5 = net.connect(17);
return a5;
const a6 = net.connect(18);
helper(a6);
function helper(s) {}
const a7 = net.connect(19);
other(a7);
const a8 = net.connect(20);
events.once(a8, 'x');
const a9 = net.connect(21);
events.EventEmitter.once(a9, 'x');
const b1 = net.connect(22);
const rl = createInterface({ input: b1 });
const b2 = net.connect(23);
b2.setKeepAlive(true).on('data', () => {});
const b3 = net.connect(24);
b3.on(`error`, () => {});
const EV = 'error';
const b4 = net.connect(25);
b4.on(EV, () => {});
const b5 = net.connect(26);
b5['on']('error', () => {});
const b6 = net.connect(27);
b6.toArray();
const b7 = net.connect(28);
const b8 = new StreamableFile(b7);
const b9 = spawn('ls');
b9.stdout.on('data', () => {});
const c1 = net.connect(30);
(c1 as any).on('error', () => {});
const c2 = net.connect(31);
const alias = c2;
const c3 = net.connect(32);
c3?.on('error', () => {});

class A {
  sock = net.connect(1);
  #priv = net.connect(2);
  static st = net.connect(3);
  ['computed'] = net.connect(4);
  handled = net.connect(5);
  field: net.Socket;
  other: any;
  constructor() {
    this.field = net.connect(6);
    this.other = net.connect(7);
    this.handled.on('error', () => {});
    this.#priv.on('error', () => {});
    this.other.on('error', () => {});
    this['sock'].on('error', () => {});
  }
  m() {
    const self = this;
    function inner() { this.field.on('error', () => {}); }
  }
}
class B {
  s = net.connect(1);
  constructor() { const self = this; }
}
class C {
  s = net.connect(1);
  go() { return this.s; }
  t = net.connect(2);
  u() { helper(this.t); }
  v = net.connect(3);
  w() { this.run(this.v); }
  run(x) {}
}

const server = net.createServer((socket) => { socket.write('x'); });
net.createServer(function (sock: net.Socket) { sock.on('error', () => {}); });
const srv = new net.Server();
srv.on('connection', (sk) => { sk.end(); });
srv.on('connection', handler);
function handler(client) { client.end(); }
const arrow = (client2) => { client2.on('error', noop); };
srv.on('connection', arrow);
const tlsServer = tls.createServer({}, (sock) => {});
createServer((s: net.Socket, extra) => {});
createServer(function () {}, (sock = 1) => {});
srv.once('secureConnection', ({ a }) => {});
(srv as any).on('connection', (cs) => {});
const mk = () => net.connect(1);
mk();
export default net.connect(5);
function ff() {
  const l1 = net.connect(1);
  l1.on('error', () => {});
  const l2 = net.connect(2);
  return { l2 };
}
const { connect: dd } = net;
const e2 = dd(4);
const { connect: ee } = events as any;
for (const q1 = net.connect(1); ; ) {}
var v1 = net.connect(1); var v1 = 2;
let v2 = net.connect(1), v3 = net.connect(2);
v3.on('error', () => {});
