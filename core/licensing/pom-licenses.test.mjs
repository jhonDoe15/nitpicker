import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readPinnedTools } from '../../languages/java/builds/java-build.mjs';
import { javaJarLicenseViolations } from './test-support/dependency-licenses.mjs';
import {
  extraTools,
  gradleToolCoordinates,
  toolsWithoutCoordinates,
} from './test-support/java-tool-jars.mjs';
import { spdxOf } from './test-support/pom-licenses.mjs';

const repositories = [];

afterEach(() => {
  for (const root of repositories.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function repository() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-poms-'));
  repositories.push(root);
  return root;
}

function licenseList(names) {
  const entries = names.map((name) => `<license><name>${name}</name></license>`).join('');
  return names.length === 0 ? '' : `<licenses>${entries}</licenses>`;
}

function publish(root, coordinates, { licenses = [], parent, jar = true } = {}) {
  const [group, artifact, version] = coordinates.split(':');
  const directory = path.join(root, ...group.split('.'), artifact, version);
  mkdirSync(directory, { recursive: true });
  const [parentGroup, parentArtifact, parentVersion] = parent?.split(':') ?? [];
  const parentElement =
    parent === undefined
      ? ''
      : `<parent><groupId>${parentGroup}</groupId><artifactId>${parentArtifact}</artifactId>` +
        `<version>${parentVersion}</version></parent>`;
  writeFileSync(
    path.join(directory, `${artifact}-${version}.pom`),
    `<project>${parentElement}<groupId>${group}</groupId><artifactId>${artifact}</artifactId>` +
      `<version>${version}</version>${licenseList(licenses)}</project>`,
  );
  const file = path.join(directory, `${artifact}-${version}.jar`);
  if (jar) {
    writeFileSync(file, '');
  }
  return file;
}

describe('licenses read from the POMs of the tool jars', () => {
  it('accepts the usual names of permissive and weak-copyleft licenses', () => {
    const root = repository();
    const jars = [
      publish(root, 'com.example:guava:33.0', { licenses: ['Apache License, Version 2.0'] }),
      publish(root, 'org.example:slf4j:2.0', { licenses: ['MIT License'] }),
      publish(root, 'net.example:pmd:7.7.0', { licenses: ['BSD-style'] }),
      publish(root, 'net.example:saxon:12.5', { licenses: ['Mozilla Public License Version 2.0'] }),
      publish(root, 'net.example:spotbugs:4.9', {
        licenses: ['GNU LESSER GENERAL PUBLIC LICENSE, Version 2.1'],
      }),
    ];

    expect(javaJarLicenseViolations(jars)).toEqual([]);
  });

  it('reads the license of the nearest parent POM that declares one', () => {
    const root = repository();
    publish(root, 'org.example:parent:1', { licenses: ['GPL-3.0-only'], jar: false });
    publish(root, 'org.example:middle:1', { parent: 'org.example:parent:1', jar: false });
    const jar = publish(root, 'org.example.tools:child:2', { parent: 'org.example:middle:1' });

    expect(javaJarLicenseViolations([jar])).toEqual([
      'org.example.tools:child:2: license "GPL-3.0-only" (GPL-3.0-only) is not on the allowlist',
    ]);
  });

  it('takes several licenses in one POM as a choice, as Maven defines them', () => {
    const root = repository();
    const jar = publish(root, 'org.example:reflections:0.10', {
      licenses: ['WTFPL', 'The Apache Software License, Version 2.0'],
    });

    expect(javaJarLicenseViolations([jar])).toEqual([]);
  });

  it('rejects GPL with the classpath exception, an unknown name and a POM without a license', () => {
    const root = repository();
    const gpl = 'GNU General Public License, version 2 (GPL2), with the classpath exception';
    const jars = [
      publish(root, 'org.example:dataflow:3', { licenses: [gpl] }),
      publish(root, 'org.example:custom:1', { licenses: ['Example Community License'] }),
      publish(root, 'org.example:bare:1'),
    ];

    expect(javaJarLicenseViolations(jars)).toEqual([
      `org.example:dataflow:3: license "${gpl}" (GPL-2.0-only WITH Classpath-exception-2.0) is not on the allowlist`,
      'org.example:custom:1: license "Example Community License" (LicenseRef-Example-Community-License) is not on the allowlist',
      'org.example:bare:1: no license in its POM or a parent POM',
    ]);
  });

  it('turns license names into SPDX ids, and keeps an id that already is one', () => {
    expect(
      [
        'ASL, version 2',
        'The BSD3 License',
        'Eclipse Public License v2.0',
        'LGPL-2.1-or-later',
      ].map(spdxOf),
    ).toEqual(['Apache-2.0', 'BSD-3-Clause', 'EPL-2.0', 'LGPL-2.1-or-later']);
  });
});

describe('the tool jars to read', () => {
  const pinned = readPinnedTools();

  it('finds coordinates for every pinned tool that is downloaded', () => {
    expect(toolsWithoutCoordinates(pinned)).toEqual([]);
  });

  it('adds the formatters, ArchUnit, ASM and the Kotlin tools, which only the Gradle init script names', () => {
    const names = extraTools(pinned).map(({ name }) => name);

    expect(names).toEqual([
      'format',
      'format-palantir',
      'archunit',
      'asm-analysis',
      'kotlin-compiler-embeddable',
      'detekt-cli',
      'kotlin-stdlib',
      'ktlint-cli',
      'ktfmt',
    ]);
  });

  it('reads coordinates written with the pinned or the versions map', () => {
    const scripts = ['a "g.x:tool:${pinned.pmd}"', 'b("g.y:other:${versions.errorProne}")'];

    expect(gradleToolCoordinates({ pmd: '1', errorProne: '2' }, scripts)).toEqual([
      { key: 'pmd', coordinates: 'g.x:tool:1' },
      { key: 'errorProne', coordinates: 'g.y:other:2' },
    ]);
  });
});
