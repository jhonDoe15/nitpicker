import { strictAdaptersConfig } from '../eslint-config/strict-adapters.mjs';
import { strictSyntaxConfig } from '../eslint-config/strict.mjs';

const filename = 'src/main/features/billing/adapters/http.ts';

function adapterCase(name, banned, allowed) {
  return { name: `adapters: ${name}`, config: strictAdaptersConfig, filename, banned, allowed };
}

export const adapterFailureMessageCases = [
  adapterCase(
    'type predicate names a zod schema',
    'function isInvoice(value: unknown): value is Invoice { return typeof value === "object"; }',
    'zod schema',
  ),
  adapterCase(
    'assertion function names schema.parse',
    'function assertInvoice(value: unknown): asserts value is Invoice {}',
    'schema.parse',
  ),
  adapterCase(
    'unvalidated JSON.parse names schema.safeParse',
    'const body = JSON.parse(text); use(body);',
    'schema.safeParse',
  ),
];

export const adapterSyntaxFailureMessageCases = [
  {
    name: 'adapter for(;;) names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'for (let i = 0; i < 3; i++) { run(i); }',
    allowed: 'for...of',
  },
  {
    name: 'adapter for...in names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'for (const key in record) { run(key); }',
    allowed: 'for...of',
  },
  {
    name: 'adapter while names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'while (queue.length > 0) { run(queue.pop()); }',
    allowed: 'for...of',
  },
  {
    name: 'adapter do-while names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'do { run(); } while (more());',
    allowed: 'for...of',
  },
  {
    name: 'adapter forEach names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'items.forEach((item) => run(item));',
    allowed: 'for...of',
  },
  {
    name: 'adapter then chain names async/await',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'fetchOne().then((value) => use(value));',
    allowed: 'async/await',
  },
  {
    name: 'adapter catch chain names async/await',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'fetchOne().catch((error) => use(error));',
    allowed: 'try/catch',
  },
  {
    name: 'adapter bare Error names Error subclass',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: "function f() { throw new Error('failed'); }",
    allowed: 'Error subclass',
  },
  {
    name: 'adapter literal throw names Error subclass',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: "function f() { throw 'failed'; }",
    allowed: 'preserves cause',
  },
  {
    name: 'adapter silent catch names rethrowing with cause',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch (error) { cleanup(); }',
    allowed: '{ cause: error }',
  },
  {
    name: 'adapter silent catch names the failure result',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch { return []; }',
    allowed: 'Return a failure result',
  },
  {
    name: 'adapter self-recursion names a for...of loop for retries',
    config: strictSyntaxConfig,
    filename: 'src/main/features/billing/adapters/http.ts',
    banned: 'async function fetchWithRetry(n) { return n > 0 ? fetchWithRetry(n - 1) : 0; }',
    allowed: 'for...of',
  },
  {
    name: 'adapter tree-walk recursion names a worklist',
    config: strictSyntaxConfig,
    filename: 'src/main/features/billing/adapters/walk.ts',
    banned: 'function walk(node) { return node.children.flatMap((child) => walk(child)); }',
    allowed: 'worklist',
  },
  {
    name: 'composition-root self-recursion names a for...of loop for retries',
    config: strictSyntaxConfig,
    filename: 'src/main/composition-root.ts',
    banned: 'function poll(n) { return n > 0 ? poll(n - 1) : 0; }',
    allowed: 'for...of',
  },
  {
    name: 'adapter empty catch is rejected',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch (error) {}',
    allowed: 'Return a failure result',
  },
  {
    name: 'adapter lost cause names cause',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch (error) { throw new Error(String(error)); }',
    allowed: 'original cause',
  },
];
