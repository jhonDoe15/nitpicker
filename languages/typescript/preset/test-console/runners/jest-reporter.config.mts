import { createJestReporter } from './jest-reporter.mts';

export default function testConsoleReporter(): ReturnType<typeof createJestReporter> {
  return createJestReporter({ environment: process.env, directory: process.cwd() });
}
