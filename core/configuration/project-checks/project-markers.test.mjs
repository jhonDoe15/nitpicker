import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(preset, files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-markers-'));
  roots.push(root);
  const all = { 'nitpicker.config.json': JSON.stringify({ preset }), ...files };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const JVM_FILES = 'pom.xml, build.gradle, build.gradle.kts, settings.gradle or settings.gradle.kts';
const PYTHON_FILES = 'pyproject.toml, setup.py, setup.cfg, Pipfile, requirements.txt or .py file';

function missing(preset, root, files) {
  return (
    `nitpicker.config.json: "preset" is "${preset}", but ${root} has no ${files}. ` +
    `Run nitpicker from the project's folder, or fix "preset".`
  );
}

describe('the preset against the build files of its folder', () => {
  it.each([
    ['java', JVM_FILES],
    ['kotlin', JVM_FILES],
    ['python', PYTHON_FILES],
    ['go', 'go.mod'],
  ])('rejects "%s" in a folder without its build files', (preset, files) => {
    const root = project(preset, {
      'README.md': '# app',
      'node_modules/pkg/tool.py': '',
      'venv/lib/site.py': '',
      '.tox/run.py': '',
      'build/lib/gen.py': '',
    });
    expect(() => loadConfig(root)).toThrow(missing(preset, root, files));
  });

  it.each([
    ['java', 'pom.xml'],
    ['java', 'settings.gradle.kts'],
    ['kotlin', 'build.gradle.kts'],
    ['python', 'pyproject.toml'],
    ['python', 'requirements.txt'],
    ['python', 'scripts/tool.py'],
    ['go', 'go.mod'],
  ])('accepts "%s" with %s', (preset, file) => {
    const root = project(preset, { [file]: '' });
    expect(loadConfig(root).preset).toBe(preset);
  });

  it('leaves the script presets alone', () => {
    for (const preset of ['typescript', 'javascript']) {
      expect(loadConfig(project(preset, {})).preset).toBe(preset);
    }
  });
});
