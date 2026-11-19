import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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

  it('reports each failed module as a tool error and points at exclude for a non-Java step', () => {
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
          'to check the rest without it.',
        classification: 'tool-error',
      },
      {
        tool: 'maven',
        rule: MODULE_BUILD_FAILED_RULE,
        path: 'app',
        identity: `${MODULE_BUILD_FAILED_RULE}:app`,
        message:
          'Maven could not build module app, so its checks did not run; the other modules were checked. ' +
          'Maven: it was not built because a module it depends on failed (ui)',
        classification: 'tool-error',
      },
    ]);
  });
});
