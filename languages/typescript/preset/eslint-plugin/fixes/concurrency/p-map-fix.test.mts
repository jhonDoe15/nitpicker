import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/concurrency/unbounded-fan-out.mts';

const IMPORT = 'import pMap from "p-map";\n';

function limited(code: string, output: string) {
  return {
    code: `${IMPORT}${code}`,
    errors: [
      {
        messageId: 'unbounded' as const,
        suggestions: [{ messageId: 'addConcurrency' as const, output: `${IMPORT}${output}` }],
      },
    ],
  };
}

function unchanged(code: string) {
  return { code: `${IMPORT}${code}`, errors: [{ messageId: 'unbounded' as const }] };
}

typescriptRuleTester().run('pMap concurrency suggestion', rule, {
  valid: [
    `${IMPORT}export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { ...base });`,
    `${IMPORT}export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), options);`,
    `${IMPORT}export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { concurrency: 4 });`,
  ],
  invalid: [
    limited(
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(`/x/${id}`));',
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(`/x/${id}`), { concurrency: 8 });',
    ),
    limited(
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), {});',
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { concurrency: 8 });',
    ),
    limited(
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { stopOnError: false });',
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { stopOnError: false, concurrency: 8 });',
    ),
    limited(
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { concurrency: Infinity });',
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { concurrency: 8 });',
    ),
    limited(
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { concurrency: Infinity, stopOnError: false });',
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { concurrency: 8, stopOnError: false });',
    ),
    limited(
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { stopOnError: false, });',
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { stopOnError: false, concurrency: 8, });',
    ),
    limited(
      'export const load = (ids: string[], stopOnError: boolean) => pMap(ids, (id) => fetch(id), { stopOnError });',
      'export const load = (ids: string[], stopOnError: boolean) => pMap(ids, (id) => fetch(id), { stopOnError, concurrency: 8 });',
    ),
    limited(
      'export async function load(ids: string[]) {\n  return await pMap(\n    ids,\n    (id) => fetch(id),\n  );\n}',
      'export async function load(ids: string[]) {\n  return await pMap(\n    ids,\n    (id) => fetch(id), { concurrency: 8 },\n  );\n}',
    ),
    limited(
      'export const load = (ids: string[]) => pMap(ids, async (id) => { const r = await fetch(id); return r.json(); });',
      'export const load = (ids: string[]) => pMap(ids, async (id) => { const r = await fetch(id); return r.json(); }, { concurrency: 8 });',
    ),
    limited(
      'export const load = (ids: string[]) => pMap<string, Response>(ids, (id) => fetch(id));',
      'export const load = (ids: string[]) => pMap<string, Response>(ids, (id) => fetch(id), { concurrency: 8 });',
    ),
    limited(
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id) /* each */);',
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { concurrency: 8 } /* each */);',
    ),
    {
      code: 'import pm from "p-map";\nexport const load = (ids: string[]) => pm(ids, (id) => fetch(id));',
      errors: [
        {
          messageId: 'unbounded' as const,
          suggestions: [
            {
              messageId: 'addConcurrency' as const,
              output:
                'import pm from "p-map";\nexport const load = (ids: string[]) => pm(ids, (id) => fetch(id), { concurrency: 8 });',
            },
          ],
        },
      ],
    },
    unchanged(
      'export const load = (ids: string[]) => pMap(ids, (id) => fetch(id), { concurrency: /* all */ Infinity });',
    ),
  ],
});
