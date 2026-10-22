import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  javaToolLicenseViolations,
  JAVA_TOOL_LICENSES,
  lockedPackages,
  npmLicenseViolations,
} from './test-support/dependency-licenses.mjs';
import {
  classifyExpression,
  offersChoice,
  declaredExpression,
  forbiddenLicenseText,
  PERMISSIVE,
  REJECTED,
  WEAK_COPYLEFT,
} from './test-support/license-rule.mjs';
import { readPinnedTools } from '../../languages/java/builds/java-build.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
    expect(javaToolLicenseViolations(readPinnedTools())).toEqual([]);
  });

  it('knows a license for every pinned Java tool and the SpotBugs plugin', () => {
    const tools = Object.keys(readPinnedTools());

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
  it('rejects a tool with no license entry', () => {
    expect(javaToolLicenseViolations({ sonarJava: '8.0.0' })).toEqual([
      'sonarJava: license undefined is not on the allowlist',
    ]);
  });

  it('rejects a version that is not exact', () => {
    expect(javaToolLicenseViolations({ pmd: '7.+' })).toEqual([
      'pmd: version "7.+" is not pinned exactly',
    ]);
  });
});

describe('classifyExpression', () => {
  it.each([
    ['MIT', PERMISSIVE],
    ['Apache-2.0', PERMISSIVE],
    ['BSD-3-Clause', PERMISSIVE],
    ['ISC', PERMISSIVE],
    ['LGPL-2.1', WEAK_COPYLEFT],
    ['LGPL-3.0-or-later', WEAK_COPYLEFT],
    ['LGPL-2.1+', WEAK_COPYLEFT],
    ['EPL-2.0', WEAK_COPYLEFT],
    ['MPL-2.0', WEAK_COPYLEFT],
    ['GPL-2.0', REJECTED],
    ['GPL-3.0-only', REJECTED],
    ['AGPL-3.0', REJECTED],
    ['GPL-2.0 WITH Classpath-exception-2.0', REJECTED],
    ['SSPL-1.0', REJECTED],
    ['BUSL-1.1', REJECTED],
    ['Elastic-2.0', REJECTED],
    ['SEE LICENSE IN LICENSE.md', REJECTED],
    ['UNLICENSED', REJECTED],
    ['\u0001permissive', REJECTED],
    ['BSD-style', REJECTED],
  ])('%s is %s', (expression, verdict) => {
    expect(classifyExpression(expression)).toBe(verdict);
  });

  it.each([
    ['(MIT OR GPL-3.0)', PERMISSIVE],
    ['GPL-3.0 OR LGPL-2.1', WEAK_COPYLEFT],
    ['MIT AND GPL-3.0', REJECTED],
    ['MIT AND MPL-2.0', WEAK_COPYLEFT],
    ['(MIT AND Apache-2.0) OR GPL-3.0', PERMISSIVE],
    ['MIT AND (GPL-3.0 OR BSD-2-Clause)', PERMISSIVE],
    ['MIT AND (GPL-3.0 OR SSPL-1.0)', REJECTED],
    ['(Apache-2.0 OR (MIT AND ISC))', PERMISSIVE],
  ])('expression %s is %s', (expression, verdict) => {
    expect(classifyExpression(expression)).toBe(verdict);
  });
});

describe('declaredExpression', () => {
  it('reads the SPDX string, the legacy object and the legacy array', () => {
    expect(declaredExpression({ license: 'MIT' })).toBe('MIT');
    expect(declaredExpression({ license: { type: 'ISC' } })).toBe('ISC');
    expect(declaredExpression({ licenses: [{ type: 'MIT' }, 'Apache-2.0'] })).toBe(
      'MIT OR Apache-2.0',
    );
  });

  it('is undefined without a license', () => {
    expect(declaredExpression({})).toBeUndefined();
    expect(declaredExpression({ licenses: [] })).toBeUndefined();
  });
});

describe('forbiddenLicenseText', () => {
  it.each([
    ['GNU AFFERO GENERAL PUBLIC LICENSE\n Version 3', 'GPL or AGPL'],
    ['# GNU GENERAL PUBLIC LICENSE\nVersion 2, June 1991', 'GPL or AGPL'],
    ['**GNU GENERAL PUBLIC LICENSE**\n**Version 3, 29 June 2007**', 'GPL or AGPL'],
    ['Licensed under the GNU General Public License Version 3', 'GPL or AGPL'],
    ['GNU\nGENERAL PUBLIC\nLICENSE\nVersion 2', 'GPL or AGPL'],
    ['Creative Commons Attribution-NonCommercial 4.0', 'Creative Commons NonCommercial'],
    ['Sustainable Use License\nVersion 1.0', 'Sustainable Use License'],
    ['Redis Source Available License 2.0 (RSALv2)', 'Redis Source Available License'],
    ['The Prosperity Public License 3.0.0', 'Prosperity Public License'],
    ['  GNU GENERAL PUBLIC LICENSE\n Version 2', 'GPL or AGPL'],
    ['Server Side Public License\nVERSION 1', 'SSPL'],
    ['Sonar Source-Available License v1.0', 'SSALv1'],
    ['Business Source License 1.1', 'BSL'],
    ['Elastic License 2.0', 'Elastic License'],
    ['"Commons Clause" License Condition v1.0', 'Commons Clause'],
    ['PolyForm Noncommercial License 1.0.0', 'PolyForm'],
    ['PolyForm-Shield License 1.0.0', 'PolyForm'],
    [
      'This program is distributed under the terms of the GNU General Public License.',
      'GPL or AGPL',
    ],
    ['Functional Source License, Version 1.1', 'Functional Source License'],
  ])('flags %j', (text, name) => {
    expect(forbiddenLicenseText(text)).toBe(name);
  });

  it('accepts MIT, Apache and the LGPL text that mentions the GPL in a sentence', () => {
    expect(forbiddenLicenseText('MIT License\nPermission is hereby granted')).toBeUndefined();
    expect(forbiddenLicenseText('Apache License\nVersion 2.0, January 2004')).toBeUndefined();
    expect(
      forbiddenLicenseText(
        'GNU LESSER GENERAL PUBLIC LICENSE\nincorporates the terms of version 3 of the GNU General Public License.',
      ),
    ).toBeUndefined();
  });
});

describe('forbiddenLicenseText on license text that only mentions a name', () => {
  it('accepts an MIT license that mentions the products by name', () => {
    expect(
      forbiddenLicenseText(
        'MIT License. Not based on PolyForm, the Elastic License or the Business Source License.',
      ),
    ).toBeUndefined();
  });

  it('accepts the GPL text next to an LGPL license only when allowed', () => {
    const gpl = 'GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007';

    expect(forbiddenLicenseText(gpl)).toBe('GPL or AGPL');
    expect(forbiddenLicenseText(gpl, { allowGpl: true })).toBeUndefined();
    expect(forbiddenLicenseText('Business Source License 1.1', { allowGpl: true })).toBe('BSL');
  });
});

describe('classifyExpression for Java tools', () => {
  it('accepts an extra permissive name only when the caller passes it', () => {
    const extraPermissive = new Set(['BSD-style']);

    expect(classifyExpression('BSD-style', { extraPermissive })).toBe(PERMISSIVE);
    expect(classifyExpression('BSD-style')).toBe(REJECTED);
  });
});

describe('offersChoice', () => {
  it('is true for an OR with an acceptable arm and false otherwise', () => {
    expect(offersChoice('(MIT OR GPL-3.0)')).toBe(true);
    expect(offersChoice('MIT')).toBe(false);
    expect(offersChoice('GPL-3.0 OR AGPL-3.0')).toBe(false);
  });
});
