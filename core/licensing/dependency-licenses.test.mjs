import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  javaToolLicenseViolations,
  JAVA_TOOL_LICENSES,
  lockedPackages,
  npmLicenseViolations,
  pinnedJavaTools,
} from './test-support/dependency-licenses.mjs';

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

function projectWith(packages) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-licenses-'));
  temporaryRoots.push(root);
  const lockPackages = Object.fromEntries(
    Object.entries(packages).map(([name, { manifest, version = '1.0.0' }]) => [
      `node_modules/${name}`,
      { version, ...manifest },
    ]),
  );
  writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({ packages: { '': { name: 'demo' }, ...lockPackages } }),
  );
  for (const [name, { files = {} }] of Object.entries(packages)) {
    const directory = path.join(root, 'node_modules', name);
    mkdirSync(directory, { recursive: true });
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      writeFileSync(path.join(directory, file), text);
    }
  }
  return root;
}

describe('licenses of what nitpicker ships', () => {
  it('allows only permissive or unmodified weak-copyleft npm packages', () => {
    expect(npmLicenseViolations(repositoryRoot)).toEqual([]);
  });

  it('reads the whole locked dependency tree, not just package.json', () => {
    const names = lockedPackages(repositoryRoot).map(({ label }) => label.replace(/@[^@]*$/, ''));

    expect(
      ['eslint', 'typescript-eslint', 'axe-core', 'minimatch'].filter(
        (name) => !names.includes(name),
      ),
    ).toEqual([]);
  });

  it('allows only permissive or weak-copyleft pinned Java tools, all pinned exactly', () => {
    expect(javaToolLicenseViolations(initScript)).toEqual([]);
  });

  it('knows a license for every pinned Java tool and the SpotBugs plugin', () => {
    const tools = pinnedJavaTools(initScript).map(({ tool }) => tool);

    expect(['pmd', 'spotbugs', 'findSecBugs'].filter((tool) => !tools.includes(tool))).toEqual([]);
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

  it('accepts a dual-licensed package that ships both license texts', () => {
    const root = projectWith({
      dual: {
        manifest: { license: '(MIT OR GPL-3.0)' },
        files: {
          LICENSE: 'MIT License\n\nPermission is hereby granted',
          'LICENSE-GPL': '# GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007',
        },
      },
    });

    expect(npmLicenseViolations(root)).toEqual([]);
  });

  it('accepts an LGPL package that ships the GPL text next to the lesser license', () => {
    const root = projectWith({
      lesser: {
        manifest: { license: 'LGPL-3.0-or-later' },
        files: {
          COPYING: 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007',
          'COPYING.LESSER': 'GNU LESSER GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007',
        },
      },
    });

    expect(npmLicenseViolations(root)).toEqual([]);
  });

  it('accepts an MIT license that only mentions another license by name', () => {
    const root = projectWith({
      mention: {
        manifest: { license: 'MIT' },
        files: { LICENSE: 'MIT License\n\nUnlike PolyForm or the Elastic License, this is free.' },
      },
    });

    expect(npmLicenseViolations(root)).toEqual([]);
  });

  it('reads the files of a license directory and does not fail on one', () => {
    const root = projectWith({
      reuse: {
        manifest: { license: 'MIT' },
        files: {
          'LICENSES/MIT.txt': 'MIT License',
          'LICENSES/GPL-3.0-or-later.txt': 'GNU GENERAL PUBLIC LICENSE\nVersion 3',
        },
      },
      folder: { manifest: { license: 'MIT' }, files: { 'LICENSE/notes.txt': 'MIT License' } },
    });

    expect(npmLicenseViolations(root)).toEqual([
      'reuse@1.0.0: LICENSES/GPL-3.0-or-later.txt is GPL or AGPL, which is not allowed',
    ]);
  });

  it('catches a short GPL notice in a package that declares a permissive license', () => {
    const root = projectWith({
      notice: {
        manifest: { license: 'MIT' },
        files: {
          COPYING: 'This is free software under the terms of the GNU General Public License',
        },
      },
    });

    expect(npmLicenseViolations(root)).toEqual([
      'notice@1.0.0: COPYING is GPL or AGPL, which is not allowed',
    ]);
  });

  it('rejects a package whose LICENSE file is source-available although the lock says LGPL', () => {
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

  it('rejects GPL, AGPL, SSPL, a forged verdict and a missing license field', () => {
    const root = projectWith({
      gpl: { manifest: { license: 'GPL-3.0-or-later' } },
      agpl: { manifest: { license: 'AGPL-3.0' } },
      sspl: { manifest: { license: 'SSPL-1.0' } },
      forged: { manifest: { license: '\u0001permissive' } },
      none: { manifest: {} },
    });

    expect(npmLicenseViolations(root)).toEqual([
      'gpl@1.0.0: license "GPL-3.0-or-later" is not on the allowlist',
      'agpl@1.0.0: license "AGPL-3.0" is not on the allowlist',
      'sspl@1.0.0: license "SSPL-1.0" is not on the allowlist',
      'forged@1.0.0: license "\u0001permissive" is not on the allowlist',
      'none@1.0.0: license "undefined" is not on the allowlist',
    ]);
  });

  it('skips development-only packages and checks transitive ones by their lock entry', () => {
    const root = projectWith({ outer: { manifest: { license: 'MIT' } } });
    writeFileSync(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        packages: {
          '': { name: 'demo' },
          'node_modules/outer': { version: '1.0.0', license: 'MIT' },
          'node_modules/outer/node_modules/inner': { version: '2.0.0', license: 'BUSL-1.1' },
          'node_modules/tool': { version: '3.0.0', license: 'GPL-3.0', dev: true },
        },
      }),
    );

    expect(npmLicenseViolations(root)).toEqual([
      'inner@2.0.0: license "BUSL-1.1" is not on the allowlist',
    ]);
  });

  it('uses the package name of an alias entry', () => {
    const root = projectWith({});
    writeFileSync(
      path.join(root, 'package-lock.json'),
      JSON.stringify({
        packages: {
          'node_modules/typescript-native': {
            name: 'typescript',
            version: '7.0.2',
            license: 'GPL-2.0',
          },
        },
      }),
    );

    expect(npmLicenseViolations(root)).toEqual([
      'typescript@7.0.2: license "GPL-2.0" is not on the allowlist',
    ]);
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
