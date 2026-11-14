import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readReportModules } from '../../adapters/gradle-reports/report-modules.mjs';
import { includedBuilds, includedSourceBuilds, includesSubprojects } from './included-builds.mjs';

const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'included-builds-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const COMPOSITE = {
  'settings.gradle':
    "includeBuild('services/orders')\nincludeBuild 'services/users/'\nincludeBuild('build-logic')\n" +
    "includeBuild(file('tools/empty'))\nincludeBuild('../shared')\n",
  'services/orders/settings.gradle': '',
  'services/orders/src/main/java/Orders.java': 'class Orders {}\n',
  'services/users/settings.gradle.kts': '',
  'services/users/src/main/kotlin/Users.kt': 'class Users\n',
  'build-logic/settings.gradle': '',
  'build-logic/src/main/kotlin/Conventions.kt': 'class Conventions\n',
  'tools/empty/settings.gradle': '',
};

describe('included builds', () => {
  it('reads every includeBuild of the settings', () => {
    expect(includedBuilds(project(COMPOSITE))).toEqual([
      'services/orders',
      'services/users/',
      'build-logic',
      'tools/empty',
      '../shared',
    ]);
  });

  it('keeps the included builds inside the folder that hold Java or Kotlin code', () => {
    expect(includedSourceBuilds(project(COMPOSITE))).toEqual(['services/orders', 'services/users']);
  });

  it('tells subprojects of the build apart from included builds', () => {
    expect(includesSubprojects(project(COMPOSITE))).toBe(false);
    expect(includesSubprojects(project({ 'settings.gradle': "include(':app')\n" }))).toBe(true);
    expect(includesSubprojects(project({ 'settings.gradle.kts': 'include("app", "lib")\n' }))).toBe(
      true,
    );
  });

  it('names the included builds when no project of the build applies the java plugin', () => {
    const root = project(COMPOSITE);

    expect(() => readReportModules(path.join(root, 'reports'), 'java', root)).toThrow(
      'The java preset found no Gradle project that applies the java plugin. The build includes ' +
        'the builds services/orders, services/users, which hold the code: gate each as a project ' +
        'of its own with "projects": ["services/orders", "services/users"] in nitpicker.config.json',
    );
  });
});
