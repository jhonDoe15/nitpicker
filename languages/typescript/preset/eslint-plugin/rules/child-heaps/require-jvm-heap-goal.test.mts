import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './require-jvm-heap-goal.mts';

const tester = typescriptRuleTester();
const CP = "import { spawn, spawnSync } from 'node:child_process';";

function invalid(code: string) {
  return { code: `${CP} ${code}`, errors: [{ messageId: 'ceilingWithoutGoal' }] };
}

tester.run('require-jvm-heap-goal', rule, {
  valid: [
    `${CP} for (const m of modules) spawn('java', [\`-XX:MaxRAMPercentage=\${share}\`, '-XX:GCTimeRatio=4', '-cp', cp, main, m]);`,
    `${CP} spawn('java', ['-Xmx2g', '-cp', cp, main]);`,
    `${CP} export function once(cp) { return spawnSync('java', ['-Xmx2g', '-cp', cp, 'Main']); }`,
    `${CP} for (const m of modules) spawn('java', ['-Xmx2g', ...userArgs, m]);`,
    `${CP} for (const m of modules) spawn('node', ['--max-old-space-size=4096', m]);`,
    `${CP} for (const m of modules) spawn('java', ['-cp', cp, main, m]);`,
    `${CP} for (const m of modules) spawn('java', ['-Xmx2g', goalFlag, m]);`,
    `${CP} for (const m of modules) spawn('java', ['-Xmx1g', '-jar', 'a.jar'], { env: { ...process.env, JAVA_TOOL_OPTIONS: '-XX:GCTimeRatio=4' } });`,
    `${CP} for (const m of modules) spawn('gradle', ['build'], { env: { ...process.env, JAVA_TOOL_OPTIONS: '-Xmx1g -XX:GCTimeRatio=4' } });`,
  ],
  invalid: [
    invalid(
      `for (const m of modules) spawn('java', [\`-XX:MaxRAMPercentage=\${share}\`, '-cp', cp, main, m]);`,
    ),
    invalid(
      "export const f = (javaPath, modules) => Promise.all(modules.map((m) => spawn(javaPath, ['-Xmx2g', m])));",
    ),
    invalid(
      "function runModule(m) { return spawnSync('/usr/lib/jvm/bin/java', ['-Xmx1g', '-jar', tool, m]); } export const f = (ms) => { for (const m of ms) runModule(m); };",
    ),
    invalid(
      "export const f = (ms) => ms.map(start); function start(m) { return spawn('java', ['-Xmx1g', m]); }",
    ),
    invalid(
      "for (const m of modules) spawn('gradle', ['build'], { env: { ...process.env, JAVA_TOOL_OPTIONS: '-Xmx1g' } });",
    ),
  ],
});
