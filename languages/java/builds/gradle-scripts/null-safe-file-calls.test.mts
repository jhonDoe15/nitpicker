import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../../adapters/java-analyzer.mts';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '../../../..');
const FILE_METHODS = [
  'isFile',
  'isDirectory',
  'isHidden',
  'exists',
  'canRead',
  'canWrite',
  'canExecute',
  String.raw`length(?=\s*\()`,
  'lastModified',
  'listFiles',
  'list',
  'readLines',
  'getText',
  'text',
  'eachLine',
  'newReader',
];
const NULL_SAFE_FILE_CALL = new RegExp(
  String.raw`\?\.(?:${FILE_METHODS.join('|')})\b(?!\s*=)`,
  'u',
);

describe('Gradle scripts', () => {
  it('shipped with the Java analyzer null-check a File before calling it, as Gradle 9 calls it even through ?.', () => {
    const offending = configurationFiles()
      .filter((file) => file.endsWith('.gradle'))
      .flatMap((file) =>
        readFileSync(path.join(PACKAGE_ROOT, file), 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            NULL_SAFE_FILE_CALL.test(line) ? [`${file}:${String(index + 1)}: ${line.trim()}`] : [],
          ),
      );
    expect(offending).toEqual([]);
  });
});
