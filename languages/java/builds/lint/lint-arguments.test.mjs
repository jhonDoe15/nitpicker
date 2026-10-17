import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { zipOf } from '../test-support/zip-writer.mjs';
import { isJavaModule } from './lint-arguments.mjs';

const roots = [];

function temporary() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-lint-arguments-'));
  roots.push(root);
  return root;
}

function writeFiles(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('isJavaModule', () => {
  it('recognizes explicit, automatic and multi-release modules, in jars and directories', () => {
    const root = temporary();
    const jars = {
      'explicit.jar': { 'module-info.class': '' },
      'automatic.jar': {
        'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\nAutomatic-Module-Name: demo.auto\n',
      },
      'versioned.jar': { 'META-INF/versions/11/module-info.class': '' },
      'plain.jar': { 'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\n', 'demo/A.class': '' },
    };
    for (const [name, entries] of Object.entries(jars)) {
      writeFileSync(path.join(root, name), zipOf(entries));
    }
    writeFiles(root, {
      'classes/module-info.class': '',
      'plain-classes/demo/A.class': '',
      'notes.txt': '',
    });

    expect(
      [...Object.keys(jars), 'classes', 'plain-classes', 'notes.txt'].filter((name) =>
        isJavaModule(path.join(root, name)),
      ),
    ).toEqual(['explicit.jar', 'automatic.jar', 'versioned.jar', 'classes']);
  });

  it('treats a jar that is not a zip archive as no module', () => {
    const root = temporary();
    writeFiles(root, { 'broken.jar': 'this is not a zip archive', 'empty.jar': '' });

    expect(['broken.jar', 'empty.jar'].map((name) => isJavaModule(path.join(root, name)))).toEqual([
      false,
      false,
    ]);
  });

  it('treats a path that does not exist as no module', () => {
    const root = temporary();

    expect(['classes', 'missing.jar'].map((name) => isJavaModule(path.join(root, name)))).toEqual([
      false,
      false,
    ]);
  });
});
