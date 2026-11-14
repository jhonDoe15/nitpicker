import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './settle-pending-on-close.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/features/a/adapters/x.ts';
const inClass = (body) => ({ filename, code: `class Client { ${body} }` });
const factory = (body) => ({ filename, code: `function createClient() { ${body} }` });
const bad = (build, body) => ({ ...build(body), errors: [{ messageId: 'unsettled' }] });

const SEND =
  'send(id: string) { return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); }); }';
const REJECT_ALL =
  'close() { for (const entry of this.pending.values()) { entry.reject(new Error("closed")); } this.pending.clear(); }';

tester.run('settle-pending-on-close', rule, {
  valid: [
    inClass(`pending = new Map<string, any>(); ${SEND} ${REJECT_ALL}`),
    inClass(
      'pending = new Map(); send(id, resolve, reject) { this.pending.set(id, { resolve, reject }); } close() { this.pending.forEach((entry) => entry.reject(new Error("x"))); this.pending.clear(); }',
    ),
    inClass(
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { for (const [id, cb] of this.pending) { cb(new Error(id)); } }',
    ),
    inClass(
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { this.failAll(); } failAll() { for (const cb of this.pending.values()) { cb(null); } }',
    ),
    inClass(
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { rejectAll(this.pending); }',
    ),
    inClass(
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { Object.values(this.pending); }',
    ),
    inClass('pending = new Map(); send(id, cb) { this.pending.set(id, cb); } start() {}'),
    inClass(
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { rejectAll([...this.pending.values()]); this.pending.clear(); }',
    ),
    inClass(
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { for (const p of this.pending.values()) { this.fail(p); } } fail(p) { p(new Error("x")); }',
    ),
    inClass(
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { const all = [...this.pending.values()]; this.pending.clear(); for (const p of all) { p(new Error("x")); } }',
    ),
    inClass(
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { for (const id of this.pending.keys()) { this.pending.get(id)(new Error(id)); } }',
    ),
    inClass(
      'handlers = new Map(); on(name, handler) { this.handlers.set(name, handler); } close() { this.handlers.clear(); }',
    ),
    inClass(
      'names = new Map<string, string>(); add(id, handler) { this.names.set(id, handler); } close() { this.names.clear(); }',
    ),
    inClass(
      'names = new Map<string, string>(); add(id, name) { this.names.set(id, name); } close() { this.names.clear(); }',
    ),
    inClass(
      'seen = new Set<string>(); add(id) { this.seen.add(id); } close() { this.seen.clear(); }',
    ),
    factory(
      'const pending = new Map(); function send(id, cb) { pending.set(id, cb); } function close() { for (const cb of pending.values()) { cb(new Error("closed")); } pending.clear(); } return { send, close };',
    ),
    {
      filename,
      code: 'const pending = new Map<string, () => void>(); export function send(id, cb) { pending.set(id, cb); }',
    },
  ],
  invalid: [
    bad(inClass, `pending = new Map<string, any>(); ${SEND} close() { this.pending.clear(); }`),
    bad(
      inClass,
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { this.pending.clear(); }',
    ),
    bad(
      inClass,
      'pending = new Map<string, (error?: Error) => void>(); close() { this.pending.clear(); }',
    ),
    bad(
      inClass,
      'private pending: Map<string, { resolve: (value: string) => void; reject: (error: Error) => void }> = new Map(); close() { this.pending.clear(); }',
    ),
    bad(
      inClass,
      'pending = new Map(); send(id) { this.pending.set(id, () => {}); } disconnect() { this.pending.clear(); }',
    ),
    bad(
      inClass,
      'constructor() { this.pending = new Map(); } send(id, resolve, reject) { this.pending.set(id, { resolve, reject }); } dispose() { this.pending = new Map(); }',
    ),
    bad(
      factory,
      'const pending = new Map(); function send(id, cb) { pending.set(id, cb); } function close() { pending.clear(); } return { send, close };',
    ),
    bad(
      inClass,
      'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } close() { for (const id of this.pending.keys()) { this.pending.delete(id); } }',
    ),
    {
      ...inClass(
        'pending = new Map(); send(id, cb) { this.pending.set(id, cb); } end() { this.pending.clear(); }',
      ),
      errors: [
        {
          message:
            'pending keeps pending requests (callbacks or resolve and reject pairs), but end() never settles them, so every caller still waiting hangs forever. Reject each entry with an error before clearing: `for (const entry of pending.values()) { entry.reject(new Error("closed")); } pending.clear();`, or hand pending to a helper that does. An exception fits only when the entries are settled elsewhere before the scope closes.',
        },
      ],
    },
  ],
});
