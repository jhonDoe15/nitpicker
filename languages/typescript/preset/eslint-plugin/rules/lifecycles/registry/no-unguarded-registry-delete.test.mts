import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-unguarded-registry-delete.mts';

const tester = typescriptRuleTester();
const filename = '/repo/src/providers/registry.ts';
const bad = (code: string) => ({
  filename,
  code,
  errors: [{ messageId: 'unguarded' }],
});
const ok = (code: string) => ({ filename, code });
const inClass = (body: string) =>
  `class Registry { private readonly providers = new Map<string, P>(); ${body} }`;

tester.run('no-unguarded-registry-delete', rule, {
  valid: [
    ok(
      inClass(
        `register(vendor: string, provider: P) { this.providers.set(vendor, provider); return toDisposable(() => { if (this.providers.get(vendor) !== provider) { return; } this.providers.delete(vendor); }); }`,
      ),
    ),
    ok(
      inClass(
        `register(vendor: string, provider: P) { this.providers.set(vendor, provider); return toDisposable(() => { if (this.providers.get(vendor) === provider) { this.providers.delete(vendor); } }); }`,
      ),
    ),
    ok(
      inClass(
        `register(vendor: string, provider: P) { this.providers.set(vendor, provider); return toDisposable(() => { const current = this.providers.get(vendor); if (current !== provider) { return; } this.providers.delete(vendor); }); }`,
      ),
    ),
    ok(
      inClass(
        `register(vendor: string, provider: P) { if (this.providers.has(vendor)) { throw new Error('duplicate'); } this.providers.set(vendor, provider); return toDisposable(() => { this.providers.delete(vendor); }); }`,
      ),
    ),
    ok(
      inClass(
        `register(provider: P) { const id = generateUuid(); this.providers.set(id, provider); return toDisposable(() => { this.providers.delete(id); }); }`,
      ),
    ),
    ok(
      inClass(
        `register(provider: P) { const id = this.next++; this.providers.set(id, provider); return () => { this.providers.delete(id); }; }`,
      ),
    ),
    ok(inClass(`remove(vendor: string) { this.providers.delete(vendor); }`)),
    ok(
      inClass(
        `register(vendor: string, provider: P) { this.providers.set(vendor, provider); this.providers.delete(vendor); }`,
      ),
    ),
    ok(
      inClass(
        `register(vendor: string) { this.providers.set(vendor, new P()); return () => { this.providers.delete(vendor); }; }`,
      ),
    ),
    ok(
      inClass(
        `register(vendor: string, provider: P) { this.providers.set(vendor, provider); return () => { this.other.delete(vendor); }; }`,
      ),
    ),
    ok(
      `function listen(name: string, handler: H) { const local = new Map<string, H>(); local.set(name, handler); return () => { local.delete(name); }; }`,
    ),
    ok(
      `const seen = new Set<string>(); function mark(name: string) { seen.add(name); return () => { seen.delete(name); }; }`,
    ),
    ok(
      `const map = new Map<string, H>(); function on(name: string, handler: H) { map.set(name, handler); return () => { if (map.get(name) === handler) map.delete(name); }; }`,
    ),
    ok(
      inClass(
        `register(vendor: string, provider: P) { const mine = provider; this.providers.set(vendor, provider); return toDisposable(() => { if (this.providers.get(vendor) === mine) { this.providers.delete(vendor); } }); }`,
      ),
    ),
    ok(
      `const inflight = new Map<string, Promise<R>>(); export function load(key: string, run: () => Promise<R>) { const known = inflight.get(key); if (known) { return known; } const p = run(); inflight.set(key, p); p.finally(() => { inflight.delete(key); }); return p; }`,
    ),
    ok(
      `const m = new Map<string, H>(); export function put(key: string, h: H) { if (!m.get(key)) { m.set(key, h); } return () => { m.delete(key); }; }`,
    ),
  ],
  invalid: [
    bad(
      inClass(
        `register(vendor: string, provider: P) { this.providers.set(vendor, provider); return toDisposable(() => { this.providers.delete(vendor); this.changed.fire(vendor); }); }`,
      ),
    ),
    bad(
      `const handlers = new Map<string, H>(); export function on(name: string, handler: H) { handlers.set(name, handler); return () => { handlers.delete(name); }; }`,
    ),
    bad(
      `const buckets = new Map<string, B>(); export function drain(key: string, bucket: B) { buckets.set(key, bucket); run(bucket).finally(() => { buckets.delete(key); }); }`,
    ),
    bad(
      inClass(
        `attach(group: G, scope: S) { this.providers.set(group.id, scope); group.onDidClose(() => { this.providers.delete(group.id); }); }`,
      ),
    ),
    bad(
      inClass(
        `register(vendor: string, provider: P) { this.providers.set(vendor, provider); return { dispose: () => { this.providers.delete(vendor); } }; }`,
      ),
    ),
    bad(
      inClass(
        `register(vendor: string, provider: P) { this.providers.set(vendor, provider); return toDisposable(() => { if (this.providers.get(vendor)) { this.providers.delete(vendor); } }); }`,
      ),
    ),
  ],
});
