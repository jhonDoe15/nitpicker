import strictAdaptersConfig from '../eslint-config/strict-adapters.mjs';

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
