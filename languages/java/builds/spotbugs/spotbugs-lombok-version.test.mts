import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import {
  declaredLombokVersion,
  lombokVersionOf,
  marksGeneratedByDefault,
} from './spotbugs-lombok-version.mts';

const projectWith = useTempProjects('nitpicker-lombok-version-');

describe('Lombok versions', () => {
  it('reads the version from the manifest of the processor path or from the declared coordinates', () => {
    const root = projectWith({});
    const lombok = path.join(root, 'lombok');
    mkdirSync(path.join(lombok, 'META-INF'), { recursive: true });
    writeFileSync(
      path.join(lombok, 'META-INF/MANIFEST.MF'),
      'Manifest-Version: 1.0\nLombok-Version: 1.18.30\n',
    );

    expect(lombokVersionOf([path.join(root, 'missing.jar'), root, lombok])).toBe('1.18.30');
    expect(lombokVersionOf([root])).toBeUndefined();
    expect(
      declaredLombokVersion([
        'org.mapstruct:mapstruct-processor:1.6.3',
        'org.projectlombok:lombok:1.18.36',
      ]),
    ).toBe('1.18.36');
    expect(
      declaredLombokVersion(['org.projectlombok:lombok-mapstruct-binding:0.2.0']),
    ).toBeUndefined();
  });

  it('knows that Lombok marks what it writes as generated from 1.18.34 on', () => {
    expect(
      ['1.18.34', '1.18.46', '1.19.0', '2.0.0', '1.18.34-edge'].map(marksGeneratedByDefault),
    ).toStrictEqual([true, true, true, true, true]);
    expect(
      ['1.18.32', '1.18.30', '1.16.22', 'edge', '', undefined].map(marksGeneratedByDefault),
    ).toStrictEqual([false, false, false, false, false, false]);
  });
});
