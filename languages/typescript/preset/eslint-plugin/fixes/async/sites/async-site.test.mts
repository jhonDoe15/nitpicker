import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from '../../../rules/async/no-sync-node-api-in-async.mts';
import { declines, fixes, FS } from '../sync-fs-test-support.mts';

typescriptRuleTester().run('final handlers calling async functions', rule, {
  valid: [],
  invalid: [
    declines(
      `${FS}async function flush() { fs.writeFileSync('a.txt', 'x'); }\nprocess.on('exit', () => { void flush(); });`,
    ),
    declines(
      `${FS}async function flush() { fs.writeFileSync('a.txt', 'x'); }\nfunction bye() { void flush(); }\nprocess.once('SIGTERM', bye);`,
    ),
    declines(
      `${FS}const flush = async () => { fs.writeFileSync('a.txt', 'x'); };\nprocess.on('uncaughtException', function () { flush(); });`,
    ),
    fixes(
      `${FS}async function flush() { fs.writeFileSync('a.txt', 'x'); }\nexport function run() { void flush(); }`,
      `${FS}async function flush() { await fs.promises.writeFile('a.txt', 'x'); }\nexport function run() { void flush(); }`,
    ),
    fixes(
      `${FS}async function flush() { fs.writeFileSync('a.txt', 'x'); }\nprocess.on('data', () => { void flush(); });`,
      `${FS}async function flush() { await fs.promises.writeFile('a.txt', 'x'); }\nprocess.on('data', () => { void flush(); });`,
    ),
  ],
});
