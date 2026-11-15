import { cases, typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-stale-retry-after-conflict.mjs';

const HEAD = [
  "import { OptimisticLockVersionMismatchError } from 'typeorm';",
  "import pRetry from 'p-retry';",
  "import retry from 'async-retry';",
  '',
].join('\n');
const inFunction = (body) =>
  `${HEAD}export async function run(orderRepo, order, id, next) { ${body} }`;
const CONFLICTS = '{ shouldRetry: (error) => error instanceof OptimisticLockVersionMismatchError }';
const LOOP = (
  body,
  handler = 'if (!(error instanceof OptimisticLockVersionMismatchError)) { throw error; }',
) =>
  `for (let attempt = 0; attempt < 3; attempt += 1) { try { ${body} return; } catch (error) { ${handler} } }`;

const error = (messageId, entity) => [{ messageId, data: { entity } }];

typescriptRuleTester().run('no-stale-retry-after-conflict', rule, {
  valid: cases(
    [
      `await pRetry(async () => { const row = await orderRepo.findOneByOrFail({ id }); row.status = next; return orderRepo.save(row); }, ${CONFLICTS});`,
      `await pRetry(async () => { const row = await orderRepo.findOneByOrFail({ id }); Object.assign(row, next); return orderRepo.save(row); }, ${CONFLICTS});`,
      `await pRetry(async () => { const row = await orderRepo.findOneByOrFail({ id }); return orderRepo.save({ ...row, status: next }); }, ${CONFLICTS});`,
      `await pRetry(async () => { const row = await orderRepo.findOneByOrFail({ id }); return orderRepo.save(apply(row, next)); }, ${CONFLICTS});`,
      `await retry(async () => { order = await orderRepo.findOneByOrFail({ id }); order.status = next; return orderRepo.save(order); }, ${CONFLICTS});`,
      `await pRetry(async () => { const current = await orderRepo.findOneByOrFail({ id }); log(current); return orderRepo.save(order); }, ${CONFLICTS});`,
      `await pRetry(async () => { await order.reload(); order.status = next; return orderRepo.save(order); }, ${CONFLICTS});`,
      `await pRetry(async () => { await orderRepo.manager.refresh(order); return orderRepo.save(order); }, ${CONFLICTS});`,
      LOOP(
        'await orderRepo.save(order);',
        'if (!(error instanceof OptimisticLockVersionMismatchError)) { throw error; } await order.reload();',
      ),
      'await pRetry(() => orderRepo.save(order), { retries: 3 });',
      `await pRetry(() => other.save(order), ${CONFLICTS});`,
      'await pRetry(() => orderRepo.save(order));\nconst kind = OptimisticLockVersionMismatchError;',
      LOOP(
        'const row = await orderRepo.findOneByOrFail({ id }); row.status = next; await orderRepo.save(row);',
      ),
      LOOP(
        'order = await orderRepo.findOneByOrFail({ id }); order.status = next; await orderRepo.save(order);',
      ),
      LOOP('await orderRepo.save(order);', 'log(error);'),
      `await orderRepo.save(order);`,
      `for (const item of items) { await orderRepo.save(item); }`,
      `const fresh = await orderRepo.findOneByOrFail({ id }); await orderRepo.save(fresh);`,
    ].map(inFunction),
  ),
  invalid: [
    {
      code: inFunction(
        `const OPTS = ${CONFLICTS};\nawait pRetry(() => orderRepo.save(order), OPTS);`,
      ),
      errors: error('stale', 'order'),
    },
    {
      code: inFunction(
        `await dataSource.transaction(async (m) => { await pRetry(() => m.save(order), ${CONFLICTS}); });`,
      ),
      errors: error('stale', 'order'),
    },
    {
      code: inFunction(`await pRetry(() => orderRepo.save(order), ${CONFLICTS});`),
      errors: error('stale', 'order'),
    },
    {
      code: inFunction(
        `await retry(async () => { order.status = next; await orderRepo.save(order); }, ${CONFLICTS});`,
      ),
      errors: error('stale', 'order'),
    },
    {
      code: inFunction(
        `await pRetry(() => orderRepo.save({ ...order, status: next }), ${CONFLICTS});`,
      ),
      errors: error('stale', 'order'),
    },
    {
      code: inFunction(`await pRetry(() => orderRepo.manager.save(Order, order), ${CONFLICTS});`),
      errors: error('stale', 'order'),
    },
    {
      code: inFunction(LOOP('await orderRepo.save(order);')),
      errors: error('stale', 'order'),
    },
    {
      code: inFunction(
        `const loaded = await orderRepo.findOneByOrFail({ id }); loaded.status = next; ${LOOP('await orderRepo.save(loaded);')}`,
      ),
      errors: error('stale', 'loaded'),
    },
    {
      code: inFunction(
        `while (true) { try { await orderRepo.save(order); break; } catch (error) { if (!(error instanceof OptimisticLockVersionMismatchError)) throw error; } }`,
      ),
      errors: error('stale', 'order'),
    },
    {
      code: inFunction(
        `await pRetry(async () => { const fresh = await orderRepo.findOneByOrFail({ id }); await orderRepo.save(fresh); }, ${CONFLICTS});`,
      ),
      errors: error('lost', 'fresh'),
    },
    {
      code: inFunction(
        LOOP('const fresh = await orderRepo.findOneBy({ id }); await orderRepo.save(fresh);'),
      ),
      errors: error('lost', 'fresh'),
    },
    {
      code: `import { retry as retryPolicy, handleType } from 'cockatiel';\n${HEAD}const policy = retryPolicy(handleType(OptimisticLockVersionMismatchError), { maxAttempts: 3 });\nexport async function run(orderRepo, order) { await policy.execute(() => orderRepo.save(order)); }`,
      errors: error('stale', 'order'),
    },
  ],
});
