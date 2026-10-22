import { createJestReporter } from './jest-reporter.mjs';

export default function testConsoleReporter() {
  return createJestReporter({ environment: process.env, directory: process.cwd() });
}
