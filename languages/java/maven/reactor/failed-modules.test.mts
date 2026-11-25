import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reportFromAnalyzerOutput } from '../../../../core/diff/execution/report/analyzer-report.mts';
import { createJavaAnalyzer } from '../../adapters/java-analyzer.mts';
import { dependencyFile } from '../quick/maven-build-arguments.mts';
import {
  MODULE_BUILD_FAILED_RULE,
  failedModuleFindings,
  failedModules,
} from './failed-modules.mts';

const ROOT = path.resolve('/repo');
const module = (name: string) => ({
  coordinates: `demo:${name}:1.0`,
  packaging: 'jar',
  basedir: path.join(ROOT, name),
  buildDirectory: path.join(ROOT, name, 'target'),
});
const [CORE, UI, APP] = [module('core'), module('ui'), module('app')];
const OUTPUT =
  'Maven failed in /repo:\n' +
  '[ERROR] Failed to execute goal com.github.eirslett:frontend-maven-plugin:1.15.0:npm (npm install) ' +
  "on project ui: Failed to run task: 'npm install' failed. (error code 1) -> [Help 1]";
const works: string[] = [];

function workWith(built: readonly (typeof CORE)[]): string {
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-failed-modules-'));
  works.push(work);
  for (const entry of built) {
    const file = dependencyFile(work, entry);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '');
  }
  return work;
}

afterEach(() => {
  for (const work of works.splice(0)) rmSync(work, { recursive: true, force: true });
});

describe('a Maven reactor where one module fails', () => {
  it('keeps the modules that built and names the failed ones with their Maven error', () => {
    const work = workWith([CORE]);

    expect(failedModules(new Error(OUTPUT), { work, modules: [CORE, UI, APP] })).toEqual([
      {
        module: UI,
        reason:
          'Failed to execute goal com.github.eirslett:frontend-maven-plugin:1.15.0:npm (npm install) ' +
          "on project ui: Failed to run task: 'npm install' failed. (error code 1)",
      },
      { module: APP, reason: undefined },
    ]);
  });

  it('leaves a build where no module or every module built to the usual failure', () => {
    const modules = [CORE, UI];

    expect(failedModules(new Error(OUTPUT), { work: workWith([]), modules })).toBe(undefined);
    expect(failedModules(new Error(OUTPUT), { work: workWith(modules), modules })).toBe(undefined);
    const compile = Object.defineProperty(new Error(OUTPUT), 'compileErrors', { value: [{}] });
    expect(failedModules(compile, { work: workWith([CORE]), modules })).toBe(undefined);
  });

  it('summarizes skipped dependents under the failed module tool error and points at exclude for a non-Java step', () => {
    const findings = failedModuleFindings(
      [
        {
          module: UI,
          reason:
            'Failed to execute goal com.github.eirslett:frontend-maven-plugin:1.15.0:npm (npm install) on project ui: npm failed',
        },
        { module: APP, reason: undefined },
      ],
      ROOT,
    );

    expect(findings).toEqual([
      {
        tool: 'maven',
        rule: MODULE_BUILD_FAILED_RULE,
        path: 'ui',
        identity: `${MODULE_BUILD_FAILED_RULE}:ui`,
        message:
          'Maven could not build module ui, so its checks did not run; the other modules were checked. ' +
          'Maven: Failed to execute goal com.github.eirslett:frontend-maven-plugin:1.15.0:npm (npm install) ' +
          'on project ui: npm failed. The failing step (frontend-maven-plugin) does not build Java classes: ' +
          'add the module to "exclude" in nitpicker.config.json, or run nitpicker on the other modules, ' +
          'to check the rest without it. 1 dependent module was skipped because ui failed: app.',
        classification: 'tool-error',
      },
    ]);
  });

  it('emits one tool error with error lines and skipped summary when 1 root module fails and 35 dependents are skipped', () => {
    const failedRoot = module('keycloak-server-spi');
    const dependents = Array.from({ length: 35 }, (_, index) => module(`dep-${String(index + 1)}`));
    const work = workWith([CORE]);
    const reactorOutput = [
      '[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile (default-compile) on project keycloak-server-spi: Compilation failure',
      '[ERROR] /repo/keycloak-server-spi/src/main/java/Spi.java:[12,5] cannot find symbol',
      '[ERROR]   symbol:   variable missing',
      '[ERROR] -> [Help 1]',
    ].join('\n');

    const failed = failedModules(new Error(reactorOutput), {
      work,
      modules: [CORE, failedRoot, ...dependents],
    });
    const findings = failedModuleFindings(failed ?? [], ROOT);

    expect(findings).toEqual([
      {
        tool: 'maven',
        rule: MODULE_BUILD_FAILED_RULE,
        path: 'keycloak-server-spi',
        identity: `${MODULE_BUILD_FAILED_RULE}:keycloak-server-spi`,
        message:
          'Maven could not build module keycloak-server-spi, so its checks did not run; the other modules were checked. ' +
          'Maven: Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile (default-compile) ' +
          'on project keycloak-server-spi: Compilation failure | ' +
          '/repo/keycloak-server-spi/src/main/java/Spi.java:[12,5] cannot find symbol | symbol:   variable missing. ' +
          '35 dependent modules were skipped because keycloak-server-spi failed: ' +
          'dep-1, dep-2, dep-3, dep-4, dep-5, dep-6, dep-7, dep-8, dep-9, dep-10 and 25 more.',
        classification: 'tool-error',
      },
    ]);
  });

  it('finds a root-cause module from raw output past 40 error lines even when it is outside the reported modules', () => {
    const upstream = module('upstream-spi');
    const work = workWith([CORE]);
    const noise = Array.from({ length: 50 }, (_, index) => `[ERROR] prior error ${String(index)}`);
    const fullOutput = [
      ...noise,
      '[ERROR] Failed to execute goal on project upstream-spi: Could not resolve dependencies for project demo:upstream-spi:jar:1.0',
      '[ERROR] -> [Help 1]',
    ].join('\n');
    const error = Object.defineProperty(
      new Error('Maven failed in /repo:\n[ERROR] prior error 0'),
      'output',
      {
        value: fullOutput,
      },
    );

    const failed = failedModules(error, {
      work,
      modules: [CORE, UI, APP],
      reactor: [CORE, upstream, UI, APP],
    });
    const findings = failedModuleFindings(failed ?? [], ROOT);

    expect(findings).toEqual([
      {
        tool: 'maven',
        rule: MODULE_BUILD_FAILED_RULE,
        path: 'upstream-spi',
        identity: `${MODULE_BUILD_FAILED_RULE}:upstream-spi`,
        message:
          'Maven could not build module upstream-spi, so its checks did not run; the other modules were checked. ' +
          'Maven: Failed to execute goal on project upstream-spi: Could not resolve dependencies for project demo:upstream-spi:jar:1.0. ' +
          '2 dependent modules were skipped because upstream-spi failed: ui, app.',
        classification: 'tool-error',
      },
    ]);
  });

  it('keeps one tool error per root-cause module and attaches the skipped summary once', () => {
    const other = module('api');
    const findings = failedModuleFindings(
      [
        {
          module: UI,
          reason:
            'Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile on project ui: compile failed',
        },
        {
          module: other,
          reason:
            'Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile on project api: compile failed',
        },
        { module: APP, reason: undefined },
      ],
      ROOT,
    );

    expect(findings.map(({ identity }) => identity)).toEqual([
      `${MODULE_BUILD_FAILED_RULE}:ui`,
      `${MODULE_BUILD_FAILED_RULE}:api`,
    ]);
    expect(findings[0]?.message).toContain(
      '1 dependent module was skipped because ui, api failed: app.',
    );
    expect(findings[1]?.message).not.toContain('skipped');
  });

  it('emits a single summary error instead of N vague errors when no failed module is identified', () => {
    const work = workWith([CORE]);
    const failed = failedModules(
      new Error('[ERROR] Could not transfer artifact demo:bom:pom:1.0'),
      {
        work,
        modules: [CORE, UI, APP],
      },
    );
    const findings = failedModuleFindings(failed ?? [], ROOT);

    expect(findings).toEqual([
      {
        tool: 'maven',
        rule: MODULE_BUILD_FAILED_RULE,
        path: '.',
        identity: `${MODULE_BUILD_FAILED_RULE}:skipped`,
        message:
          'Maven skipped 2 dependent modules because an upstream module failed (ui, app); ' +
          'their checks did not run while the other modules were checked. ' +
          'Maven: Could not transfer artifact demo:bom:pom:1.0',
        classification: 'tool-error',
      },
    ]);
  });

  it('passes the Java analyzer report parser alongside findings from built modules', () => {
    const failed = failedModuleFindings(
      [
        {
          module: UI,
          reason:
            'Failed to execute goal com.github.eirslett:frontend-maven-plugin:1.15.0:npm (npm install) on project ui: npm failed',
        },
      ],
      ROOT,
    );
    const builtModuleFinding = {
      tool: 'pmd',
      rule: 'UnusedLocalVariable',
      path: 'core/src/main/java/demo/Core.java',
      identity: 'pmd:core/src/main/java/demo/Core.java:UnusedLocalVariable',
      message: 'Unused local variable',
      classification: 'enforceable',
    };
    const findings = [builtModuleFinding, ...failed];

    const report = reportFromAnalyzerOutput(
      { ...createJavaAnalyzer(), acceptedExitCodes: [0] },
      { status: 0, signal: null, stdoutText: JSON.stringify({ findings }), stderrText: '' },
    );

    expect(report.findings).toEqual(findings);
  });
});
