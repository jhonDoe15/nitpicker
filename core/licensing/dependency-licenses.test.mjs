import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectShippedPackages,
  javaToolLicenseViolations,
  JAVA_TOOL_LICENSES,
  npmLicenseViolations,
  pinnedJavaTools,
} from './dependency-licenses.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const initScript = readFileSync(
  path.join(repositoryRoot, 'languages/java/gradle/nitpicker.init.gradle'),
  'utf8',
);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(dependencies) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-licenses-'));
  temporaryRoots.push(root);
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      dependencies: Object.fromEntries(Object.keys(dependencies).map((name) => [name, '1.0.0'])),
    }),
  );
  for (const [name, { manifest, files = {} }] of Object.entries(dependencies)) {
    const directory = path.join(root, 'node_modules', name);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({ name, version: '1.0.0', ...manifest }),
    );
    for (const [file, text] of Object.entries(files)) {
      writeFileSync(path.join(directory, file), text);
    }
  }
  return root;
}

describe('licenses of what nitpicker ships', () => {
  it('allows only permissive or unmodified weak-copyleft npm packages', () => {
    expect(npmLicenseViolations(repositoryRoot)).toEqual([]);
  });

  it('walks the whole dependency tree, not just package.json', () => {
    const names = collectShippedPackages(repositoryRoot).packages.map(
      ([, manifest]) => manifest.name,
    );

    expect(names).toEqual(
      expect.arrayContaining(['eslint', 'typescript-eslint', 'axe-core', 'minimatch']),
    );
  });

  it('allows only permissive or weak-copyleft pinned Java tools, all pinned exactly', () => {
    expect(javaToolLicenseViolations(initScript)).toEqual([]);
  });

  it('knows a license for every pinned Java tool and the SpotBugs plugin', () => {
    const tools = pinnedJavaTools(initScript).map(({ tool }) => tool);

    expect(tools).toEqual(expect.arrayContaining(['pmd', 'spotbugs', 'findSecBugs']));
    expect(tools.filter((tool) => JAVA_TOOL_LICENSES[tool] === undefined)).toEqual([]);
  });
});

describe('npm license violations', () => {
  it('accepts MIT and an OR expression with one permissive side', () => {
    const root = projectWith({
      a: {
        manifest: { license: 'MIT' },
        files: { LICENSE: 'MIT License\n\nPermission is hereby granted' },
      },
      b: { manifest: { license: '(GPL-3.0 OR Apache-2.0)' } },
    });

    expect(npmLicenseViolations(root)).toEqual([]);
  });

  it('rejects a package whose LICENSE file is source-available although package.json says LGPL', () => {
    const root = projectWith({
      sonar: {
        manifest: { license: 'LGPL-3.0-only' },
        files: { LICENSE: 'SONAR SOURCE-AVAILABLE LICENSE v1\n\nThe licensor...' },
      },
    });

    expect(npmLicenseViolations(root)).toEqual([
      'sonar@1.0.0: LICENSE is SSALv1, which is not allowed',
    ]);
  });

  it('rejects GPL, AGPL, SSPL and a missing license field', () => {
    const root = projectWith({
      gpl: { manifest: { license: 'GPL-3.0-or-later' } },
      agpl: { manifest: { license: 'AGPL-3.0' } },
      sspl: { manifest: { license: 'SSPL-1.0' } },
      none: { manifest: {} },
    });

    expect(npmLicenseViolations(root)).toEqual([
      'gpl@1.0.0: license "GPL-3.0-or-later" is not on the allowlist',
      'agpl@1.0.0: license "AGPL-3.0" is not on the allowlist',
      'sspl@1.0.0: license "SSPL-1.0" is not on the allowlist',
      'none@1.0.0: license "undefined" is not on the allowlist',
    ]);
  });

  it('checks dependencies of dependencies', () => {
    const root = projectWith({
      outer: { manifest: { license: 'MIT', dependencies: { inner: '1.0.0' } } },
    });
    const inner = path.join(root, 'node_modules/outer/node_modules/inner');
    mkdirSync(inner, { recursive: true });
    writeFileSync(
      path.join(inner, 'package.json'),
      JSON.stringify({ name: 'inner', version: '2.0.0', license: 'BUSL-1.1' }),
    );

    expect(npmLicenseViolations(root)).toEqual([
      'inner@2.0.0: license "BUSL-1.1" is not on the allowlist',
    ]);
  });

  it('reports a dependency that is not installed', () => {
    const root = projectWith({ a: { manifest: { license: 'MIT' } } });
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { a: '1.0.0', gone: '1.0.0' } }),
    );

    expect(npmLicenseViolations(root)).toEqual(['gone: listed in dependencies but not installed']);
  });
});

describe('Java tool license violations', () => {
  const script = (entries) => `def pinned = [\n${entries}\n]\n`;

  it('rejects a tool with no license entry', () => {
    expect(javaToolLicenseViolations(script("    sonarJava : '8.0.0',"))).toEqual([
      'sonarJava: license undefined is not on the allowlist',
    ]);
  });

  it('rejects a version that is not exact', () => {
    expect(javaToolLicenseViolations(script("    pmd : '7.+',"))).toEqual([
      'pmd: version "7.+" is not pinned exactly',
    ]);
  });

  it('reports an init script without a pinned map', () => {
    expect(javaToolLicenseViolations('apply plugin: "java"')).toEqual([
      'the init script has no `def pinned = [...]` map',
    ]);
  });
});
