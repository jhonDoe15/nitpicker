import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { rule } from './no-ambiguous-lookup-key.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-lookup-keys-');
afterAll(cleanup);

const HEADER = 'const cells = new Map<string, number>();\nconst seen = new Set<string>();\n';
const ERROR = [{ messageId: 'ambiguousKey' }];

function body(code: string) {
  const params = "row: string, col: string, n: number, id: string, kind: 'a' | 'b', obj: { x: 1 }";
  return `${HEADER}export function run(${params}) {\n${code}\n}`;
}

tester.run('no-ambiguous-lookup-key', rule, {
  valid: [
    `let x = 1; export const y = \`\${x}-\${x}\`;`,
    body('cells.set(JSON.stringify([row, col]), 1);'),
    body(`cells.set(\`\${n}-\${n}\`, 1);`),
    body(`cells.set(\`\${kind}:\${n}\`, 1);`),
    body(`cells.set(\`\${row}\`, 1);`),
    body(`cells.set(\`\${n.toString()}:\${String(n)}\`, 1);`),
    body(`cells.set(\`\${row}_\${Date.now()}_\${col}\`, 1);`),
    body(`const key = \`\${row}_\${Date.now()}_\${col}\`; cells.set(key, 1);`),
    body(`const id = \`\${row}:\${Math.random()}:\${col}\`; cells.set(id, 1);`),
    body(
      `const dev = n > 0 ? n : BigInt(n); cells.set(\`\${dev.toString()}:\${dev.toString()}\`, 1);`,
    ),
    body(`cells.set(\`\${row}\${col}\`, 1);`),
    body(`cells.set(\`\${row} \${col}\`, 1);`),
    body(`cells.set(\`\${id}-\${n}\`, 1);`),
    body(`cells.set(\`\${row}-\${n}\`, 1);`),
    body(`cells.set(\`\${n}-\${row}\`, 1);`),
    body('cells.set(row, 1);'),
    body('cells.set(row + col, 1);'),
    body('cells.set([n, n].join("-"), 1);'),
    body(`const key = \`\${row}-\${col}\`; console.log(key);`),
    body(`const notes = new Array<string>(); notes.push(\`\${row}-\${col}\`);`),
    body(`const log = { get(k: string) { return k; } }; log.get(\`\${row}-\${col}\`);`),
    body(`const seenByDay: Record<string, number> = {}; seenByDay[\`\${n}-\${n}\`] = 1;`),
    body('const list = [1]; list[n] = 2;'),
  ].map((code) => typed(code)),
  invalid: [
    body(`cells.set(\`\${row}-\${col}\`, 1);`),
    body(`cells.get(\`\${row}-\${col}\`);`),
    body(`cells.has(\`\${row}_\${col}\`);`),
    body(`cells.delete(\`\${row}:\${col}\`);`),
    body(`seen.add(\`\${row}|\${col}\`);`),
    body('seen.has(row + ":" + col);'),
    body('cells.set([row, col].join("-"), 1);'),
    body('cells.set([row, col].join(), 1);'),
    body(`const key = \`\${row}-\${col}\`; cells.set(key, 1);`),
    body(`cells.set(\`\${obj}-\${n}\`, 1);`),
    body(`cells.set(\`\${row.toString()}:\${col.toString()}\`, 1);`),
    body(`const groups: Record<string, number> = {}; groups[\`\${row}/\${col}\`] = 1;`),
    body(`const groups: Record<string, number> = {}; groups[\`\${row}/\${col}\`] ??= 1;`),
  ].map((code) => typed(code, ERROR)),
});
