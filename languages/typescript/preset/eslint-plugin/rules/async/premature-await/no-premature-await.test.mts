import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-premature-await.mts';

const tester = typescriptRuleTester();
const premature = (task: string) => [{ messageId: 'prematureAwait', data: { task } }];
const fn = (params: string, body: string) => `async function run(${params}) { ${body} }`;
const REPORT = 'reportJob: Promise<string>';
const WAIT = 'const report = await reportJob;';
const WORK = 'const a = loadA(); const b = loadB();';
const RETURN = 'return combine(report, a, b);';

tester.run('no-premature-await', rule, {
  valid: [
    fn(REPORT, `${WAIT} return report;`),
    fn(REPORT, `${WAIT} const a = loadA(); return combine(report, a);`),
    fn('id: string', `const user = await fetchUser(id); ${WORK} return combine(user, a, b);`),
    fn('', `const task = await new Task(); ${WORK} return combine(task, a, b);`),
    fn(
      'getCtx: () => { reportJob: Promise<string> }',
      `const report = await getCtx().reportJob; ${WORK} ${RETURN}`,
    ),
    fn('lock: Promise<void>', `await lock; ${WORK} return combine(a, b);`),
    fn('barrier: Promise<void>', 'await barrier; doA(); doB(); doC();'),
    fn('server: { close: () => Promise<void> }', 'await server.close(); doA(); doB(); doC();'),
    fn(
      'flush: Promise<void>, ready: Promise<void>',
      'await flush; await ready; doA(); doB(); doC();',
    ),
    fn(REPORT, `${WAIT} const rows = parseRows(report); ${WORK} return combine(rows, a, b);`),
    fn(
      REPORT,
      `${WAIT} const a = loadA(); const h = format(report); const b = loadB(); return combine(h, a, b);`,
    ),
    fn(
      `${REPORT}, cfg: { title: string }`,
      `${WAIT} const t = cfg.title; const n = 10; const l = \`\${t}:\${n}\`; return combine(report, l);`,
    ),
    fn(
      REPORT,
      `${WAIT} const h = () => computeHeavy(); const l = "ok"; return combine(report, h, l);`,
    ),
    fn(
      REPORT,
      `${WAIT} function h() { return computeHeavy(); } const l = "ok"; return combine(report, h, l);`,
    ),
    fn(REPORT, `${WAIT} ${WORK} return combine(a, b);`),
    fn(REPORT, `try { ${WAIT} ${WORK} ${RETURN} } finally { cleanup(); }`),
    fn(
      `${REPORT}, ok: boolean`,
      `try { if (ok) { ${WAIT} ${WORK} ${RETURN} } } finally { cleanup(); }`,
    ),
    fn(
      `${REPORT}, otherJob: Promise<string>`,
      `${WAIT} const other = await otherJob; const l = "ok"; return combine(report, other, l);`,
    ),
    fn(
      'reportJob: Promise<{ rows: number[]; total: number }>',
      `const { rows, total } = await reportJob; logCount(total); ${WORK} return combine(rows, a, b);`,
    ),
    fn(
      REPORT,
      `let job = reportJob; const report = await job; job = startNext(); const b = loadB(); return b + report;`,
    ),
    fn(
      'ctx: { reportJob: Promise<string> }',
      'const report = await ctx.reportJob; ctx.reportJob = startNext(); const b = loadB(); return b + report;',
    ),
    fn(REPORT, `let report = await reportJob; ${WORK} report = fallback(); ${RETURN}`),
    fn(
      REPORT,
      `let report = ""; const f = () => report; report = await reportJob; const a = f(); const b = loadB(); ${RETURN}`,
    ),
    fn(
      REPORT,
      `${WAIT} const a = h(); const b = loadB(); ${RETURN} function h() { return report; }`,
    ),
    fn(REPORT, `const {} = await reportJob; ${WORK} return combine(a, b);`),
    fn(
      REPORT,
      `const report = await reportJob, s = buildSummary(report); ${WORK} return combine(s, a, b);`,
    ),
  ],
  invalid: [
    { code: fn(REPORT, `${WAIT} ${WORK} ${RETURN}`), errors: premature('reportJob') },
    {
      code: fn(
        'ctx: { reportJob: Promise<string> }',
        `const report = await ctx.reportJob; ${WORK} ${RETURN}`,
      ),
      errors: premature('ctx.reportJob'),
    },
    {
      code: fn(
        REPORT,
        `${WAIT} const t = cfg.title; const a = loadA(); const n = 10; return combine(report, t, a, n);`,
      ),
      errors: premature('reportJob'),
    },
    {
      code: fn(
        REPORT,
        `${WAIT} const u = await fetchUser(); const s = await fetchSettings(); return combine(report, u, s);`,
      ),
      errors: premature('reportJob'),
    },
    {
      code: fn(
        'reportJob: Promise<{ rows: number[] }>',
        `const { rows } = await reportJob; ${WORK} return combine(rows, a, b);`,
      ),
      errors: premature('reportJob'),
    },
    {
      code: fn(REPORT, `let report = ""; report = await reportJob; ${WORK} ${RETURN}`),
      errors: premature('reportJob'),
    },
    {
      code: fn(REPORT, `try { ${WAIT} ${WORK} ${RETURN} } catch (e) { logError(e); return null; }`),
      errors: premature('reportJob'),
    },
    {
      code: fn(
        REPORT,
        `try { work(); } catch (e) { ${WAIT} ${WORK} ${RETURN} } finally { cleanup(); }`,
      ),
      errors: premature('reportJob'),
    },
    {
      code: fn(
        REPORT,
        'const report = (await reportJob) as string; const m = new Map(); const b = 2; return combine(report, m, b);',
      ),
      errors: premature('reportJob'),
    },
    {
      code: [
        'class S { reportJob!: Promise<string>;',
        `async run() { const report = await this.reportJob; ${WORK} ${RETURN} } }`,
      ].join(' '),
      errors: premature('this.reportJob'),
    },
    {
      code: fn(
        `${REPORT}, summaryJob: Promise<string>`,
        `${WAIT} const s = await summaryJob; ${WORK} return combine(report, s, a, b);`,
      ),
      errors: [...premature('reportJob'), ...premature('summaryJob')],
    },
    {
      code: fn(
        REPORT,
        `${WAIT} const f = (report: string) => log(report); const a = loadA(); return combine(report, f, a);`,
      ),
      errors: premature('reportJob'),
    },
    {
      code: `const reportJob = startReport(); ${WAIT} ${WORK} export const out = combine(report, a, b);`,
      errors: premature('reportJob'),
    },
  ],
});
