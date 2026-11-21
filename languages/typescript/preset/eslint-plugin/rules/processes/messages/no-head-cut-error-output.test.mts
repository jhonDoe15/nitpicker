import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './no-head-cut-error-output.mts';

const tester = typescriptRuleTester();

function invalid(code: string) {
  return { code, errors: [{ messageId: 'headCut' }] };
}

tester.run('no-head-cut-error-output', rule, {
  valid: [
    `throw new Error(\`build failed: \${result.stderr.slice(-4000)}\`);`,
    `throw new Error(\`build failed: \${stderr.slice(0, 2000)} … \${stderr.slice(-2000)}\`);`,
    'const preview = stdout.slice(0, 200); show(preview);',
    `throw new Error(\`bad title: \${title.slice(0, 80)}\`);`,
    `logger.info(\`output: \${output.slice(0, 500)}\`);`,
    'const first = stderr.slice(0, 1); use(first);',
    `throw new Error(\`failed: \${stderr.substring(4000)}\`);`,
    'const catalog = items.slice(0, 10); throw new Error(String(catalog));',
    `throw new Error(\`checksum mismatch \${output.slice(0, 8)}\`);`,
    `throw new Error(\`request \${trace.slice(0, 8)} failed\`);`,
    `throw new Error(\`unsupported version \${stdout.slice(0, 3)}\`);`,
    'console.error(error.stack.slice(0, 500));',
    'const head = stderr.slice(0, 100); const tail = stderr.slice(-100); throw new Error(head + tail);',
    'function fail(stderr) { const tail = stderr.slice(-100); throw new Error(stderr.slice(0, 100), { cause: tail }); }',
    'throw new Error(stderr.slice(0, stderr.length - 1));',
    "throw new Error(stderr.slice(0, stderr.lastIndexOf('\\n')));",
  ],
  invalid: [
    invalid(`throw new Error(\`build failed: \${result.stderr.slice(0, 4000)}\`);`),
    invalid("throw new Error('tool failed: ' + errorOutput.substring(0, 2000));"),
    invalid('reject(new Error(stderr.toString().trim().slice(0, 1000)));'),
    invalid('throw new Error(stderr.slice(0, Math.min(stderr.length, LIMIT)));'),
    invalid('logger.error(`compile failed`, { output: buildStderr.slice(0, 3000) });'),
    invalid('const head = result.stdout.slice(0, LIMIT); throw new ToolError(head);'),
    invalid(`throw new Error(\`failed: \${stderr.slice(0, 4000)}\`);`),
  ],
});
