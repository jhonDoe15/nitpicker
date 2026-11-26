'use strict';
import './polyfill.js';
import './index.css';
import './theme.scss?inline';
import 'reflect-metadata';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync as exists } from 'node:fs';
import * as childProcess from 'child_process';
import type {} from './types';

const started = Date.now();
export const stamp = new Date();
const fresh = new Date(0);
const socket = new WebSocket('wss://example.test');
const timer = setTimeout(() => {}, 1);
const global = globalThis.fetch('/x');
const random = Math.random();
const unique = crypto.randomUUID();
const config = readFileSync('config.json');
const found = exists('x');
const output = childProcess.execSync('ls');
const home = process.cwd();
const lazy = () => Date.now();
const computed = window['fetch']('/x');
const notEffect = JSON.parse('{}');

const target = { name: 'target' };
function Widget() {}
class Service {}
Widget.displayName = 'Widget';
Widget.defaultProps = { size: 1, onClick() {}, nested: { deep: target.name } };
Service.registry = target.name = Widget;
Object.assign(Widget, { label: 'x' });
Object.defineProperty(Service, 'tag', { value: () => 1 });
Object.assign(Widget, makeLabel());
target.value = fetchValue();
other.value = 1;

module.exports = { Widget };
exports.Service = Service;
register(Widget);
await settle();
await import('./late');

if (import.meta.main) {
  await main(process.argv.slice(2));
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetch('/guarded');
}
if (require.main === module) {
  setTimeout(() => {}, 1);
}
if (import.meta.env.DEV) {
  fetch('/dev');
}
if (ready && import.meta.main) {
  fetch('/ready');
}
if (import.meta.main) {
  run();
} else {
  fetch('/else');
}

for (const name of names) {
  console.log(name);
}
while (running) {
  tick();
}
do {
  tick();
} while (running);
try {
  risky();
} catch {
  recover();
}
switch (mode) {
  case 'a':
    break;
}
{
  scoped();
}

class Holder {
  static {
    prepare();
  }
  static value = Date.now();
  method() {
    const inner = Date.now();
    return inner;
  }
}

function later() {
  const ok = Date.now();
  fetch('/ok');
  return ok + started;
}
