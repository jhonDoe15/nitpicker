import { mergeCheckstyleFiles } from './checkstyle-merge.mjs';

const { code, message } = mergeCheckstyleFiles(process.argv.slice(2));

if (code !== 0) {
  process.stderr.write(`${message}\n`);
  process.exitCode = code;
}
