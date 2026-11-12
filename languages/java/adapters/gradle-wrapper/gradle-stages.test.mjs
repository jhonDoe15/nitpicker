import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gradleStages } from './gradle-stages.mjs';
import { createJavaAnalyzer } from '../java-analyzer.mjs';
import { parseJavaRunnerArguments } from '../java-policy.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scopeProperties(policy) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-stages-'));
  roots.push(root);
  const directory = path.join(root, 'tool-config');
  const [stage] = gradleStages([], {
    projectRoot: root,
    initScript: 'init.gradle',
    policy,
    directory,
  });
  return stage().filter((argument) => argument.startsWith('-Pnitpicker.mutationScope='));
}

describe('the mutation scope of a Gradle run', () => {
  it('reaches the runner and then Gradle as a file of paths', () => {
    const invocation = createJavaAnalyzer().createInvocation({
      projectRoot: '/project',
      toolRoot: '/tool',
      mutationScope: ['src/main/java/shop/orders'],
    });
    const { policy } = parseJavaRunnerArguments(invocation.args.slice(1));
    const [property] = scopeProperties(policy);

    expect(policy.mutationScope).toEqual(['src/main/java/shop/orders']);
    expect(JSON.parse(readFileSync(property.split('=').slice(1).join('='), 'utf8'))).toEqual([
      'src/main/java/shop/orders',
    ]);
  });

  it('passes nothing without a scope', () => {
    const invocation = createJavaAnalyzer().createInvocation({ projectRoot: '/p', toolRoot: '/t' });

    expect(invocation.args).not.toContain('--mutation-scope');
    expect(scopeProperties({})).toEqual([]);
  });
});
