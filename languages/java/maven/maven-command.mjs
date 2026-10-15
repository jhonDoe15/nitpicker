import { spawnSync } from 'node:child_process';
import { condenseFailure } from '../adapters/gradle-wrapper/failure-text.mjs';
import { wrapperTarget } from '../adapters/gradle-wrapper/gradle-command.mjs';
import { testFailureSummary } from './context/failure-summary.mjs';

const BASE_ARGUMENTS = ['-B', '-q'];
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_FAILURE_LENGTH = 3500;

export function mavenTarget(options) {
  return wrapperTarget({
    ...options,
    names: { unix: 'mvnw', windows: 'mvnw.cmd', fallback: 'mvn' },
  });
}

export function createDeadline(budgetMs, now = Date.now) {
  const end = now() + budgetMs;
  return {
    remaining() {
      const left = end - now();
      if (left <= 0) {
        throw new Error('The Maven build exceeded its time budget');
      }
      return left;
    },
  };
}

export function createMavenRunner({ projectRoot, configured, deadline, spawn = spawnSync }) {
  return function runMaven(args, { env = process.env, label = 'Maven' } = {}) {
    const target = mavenTarget({
      projectRoot,
      configured,
      args: [...BASE_ARGUMENTS, ...args],
    });
    const result = spawn(target.command, target.args, {
      cwd: projectRoot,
      encoding: 'utf8',
      env,
      maxBuffer: MAX_OUTPUT_BYTES,
      shell: target.shell,
      timeout: deadline.remaining(),
    });
    if (result.error !== undefined) {
      throw result.error;
    }
    if (result.status !== 0) {
      const output = `${result.stdout}\n${result.stderr}`;
      const detail = testFailureSummary(output) ?? condenseFailure(output, MAX_FAILURE_LENGTH);
      throw new Error(`${label} failed in ${projectRoot}: ${detail || 'no diagnostic output'}`);
    }
    return result.stdout;
  };
}
