import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESIGN_RULES } from '../../../../shared/project-rules/design/design-rules.mjs';
import {
  POOL_PROTOCOL,
  writeEscape,
  writePool,
} from '../../adapters/design/test-support/escape-sources.mjs';
import { collectJavaFindings, runJavaDiff } from '../../adapters/java-diff.mjs';
import { commitBranch, runGitIn } from '../../adapters/test-support/gradle-e2e.mjs';
import {
  useMavenPresetProject,
  enabled,
  maven,
  fixtures,
  EMPTY_CATCH,
  copyOf,
} from '../__tests__/maven-preset-project.mjs';
import { pathsOutsideProject } from '../../adapters/java-e2e/test-support/project-paths.mjs';

describe.skipIf(!enabled)('Java preset on Maven builds', () => {
  useMavenPresetProject();
  it('reads every module of a reactor under the module path, with coupling across modules', () => {
    const project = copyOf(path.join(fixtures, 'multi-module'));
    const findings = collectJavaFindings(project, {
      maven,
      policy: { testSeconds: { unitTestSeconds: -1 } },
    });
    expect(pathsOutsideProject(project, findings)).toEqual([]);
    const metrics = (file) =>
      findings
        .filter((finding) => finding.path === file && finding.metric !== undefined)
        .map(({ tool, metric }) => `${tool} ${metric.name} ${String(metric.value)}`)
        .sort();

    expect(
      findings
        .filter((finding) => ['errorprone', 'pmd'].includes(finding.tool))
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
    ).toEqual([
      'errorprone PrivateConstructorForUtilityClass app/src/main/java/demo/app/Main.java',
      'errorprone SystemOut app/src/main/java/demo/app/Main.java',
    ]);
    expect(metrics('core/src/main/java/demo/core/Adder.java')).toEqual([
      'coupling fanIn 1',
      'coupling fanOut 0',
      'coupling instability 0',
      'coupling totalCoupling 1',
      'jacoco line-coverage 100',
    ]);
    expect([...new Set(findings.map((finding) => finding.path))].sort()).toEqual([
      '.',
      'app',
      'app/src/main/java/demo/app/Main.java',
      'checks/src/test/java/demo/checks/AdderIT.java',
      'core',
      'core/src/main/java/demo/core/Adder.java',
      'core/src/test/java/demo/core/AdderTest.java',
    ]);
    expect(
      findings
        .filter((finding) => finding.tool === 'test-runtime')
        .map(({ rule, path: file, identity }) => `${rule} ${file} ${identity}`)
        .sort(),
    ).toEqual([
      'slow-test core/src/test/java/demo/core/AdderTest.java test:demo.core.AdderTest#adds',
      'test-not-run checks/src/test/java/demo/checks/AdderIT.java AdderIT',
    ]);
    expect(
      existsSync(
        path.join(
          project,
          'core/target/nitpicker/test-results/surefire/TEST-demo.core.AdderTest.xml',
        ),
      ),
    ).toBe(true);
  }, 180_000);
  it('writes the design facts of every module and reports a change to the state of another module', () => {
    const project = copyOf(path.join(fixtures, 'multi-module'));
    const escape = writeEscape(project, {
      owner: { root: 'core', package: 'demo.core' },
      caller: { root: 'app', package: 'demo.app' },
    });
    const leak = writePool(project, {
      owner: { root: 'core', package: 'demo.core' },
      caller: { root: 'app', package: 'demo.app' },
    });
    const findings = collectJavaFindings(project, {
      maven,
      policy: { testSeconds: { unitTestSeconds: -1 }, protocols: [POOL_PROTOCOL] },
    });
    const facts = JSON.parse(
      readFileSync(path.join(project, 'target/nitpicker/design-facts.json'), 'utf8'),
    );
    const main = 'app/src/main/java/demo/app/Main.java';
    const adder = 'core/src/main/java/demo/core/Adder.java';

    expect(facts.packages.map(({ root }) => root).toSorted()).toEqual(['app', 'checks', 'core']);
    expect(facts.modules.map(({ file }) => file).toSorted()).toEqual([
      'app/src/main/java/demo/app/Main.java',
      'app/src/main/java/demo/app/Report.java',
      'app/src/main/java/demo/app/Users.java',
      'core/src/main/java/demo/core/AbstractRes.java',
      'core/src/main/java/demo/core/Adder.java',
      'core/src/main/java/demo/core/Ledger.java',
      'core/src/main/java/demo/core/Pool.java',
    ]);
    expect(
      facts.types.find(({ id }) => id === 'core/src/main/java/demo/core/Pool.java#Pool').supertypes,
    ).toEqual(['core/src/main/java/demo/core/AbstractRes.java#AbstractRes']);
    expect(facts.callables.find(({ id }) => id === `${main}#Main.main`)).toEqual({
      id: `${main}#Main.main`,
      file: main,
      name: 'main',
      line: 6,
      kind: 'method',
      entry: true,
      owner: `${main}#Main`,
      exported: true,
      params: [{ name: 'args', type: 'String[]' }],
      returns: 'void',
      calls: [{ target: `${adder}#Adder.add`, line: 7 }],
      paramUses: [],
      decisions: [],
      reads: [],
    });
    expect(findings.filter(({ rule }) => DESIGN_RULES.includes(rule))).toEqual([escape, leak]);
  }, 180_000);
  it('fails a change only on what it adds', () => {
    const repository = copyOf(path.join(fixtures, 'multi-module'));
    runGitIn(repository, 'init', '-q', '-b', 'main');
    runGitIn(repository, 'add', '-A');
    runGitIn(repository, 'commit', '-q', '-m', 'base');
    commitBranch(repository, 'parser', { 'app/src/main/java/demo/app/Parser.java': EMPTY_CATCH });
    const result = runJavaDiff({
      repositoryRoot: repository,
      requestedBaseRef: 'main',
      maven,
      policy: {},
    });
    const failing = result.newEnforceable.map(
      ({ tool, rule, path: file }) => `${tool} ${rule} ${file}`,
    );

    expect(failing).toEqual(
      ['errorprone EmptyCatch', 'pit mutant-nocoverage'].map(
        (finding) => `${finding} app/src/main/java/demo/app/Parser.java`,
      ),
    );
  }, 180_000);
});
