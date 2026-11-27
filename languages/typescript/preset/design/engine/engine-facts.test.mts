import { afterEach, describe, expect, it } from 'vitest';
import { createProject, designPartOf, removeProject } from '../test-support/project.mts';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    removeProject(root);
  }
});

const EXPORTED = 'export function shown(options) {\n  return options;\n}\n';

function asksEngine(source: string, file = 'src/legacy.mjs'): boolean {
  const root = createProject({ files: { [file]: `${source}\n${EXPORTED}` } });
  roots.push(root);
  return designPartOf(root) !== undefined;
}

describe('scripts that declare types in documentation comments', () => {
  it('leaves design facts to Node when a script comment declares a type', () => {
    expect(asksEngine('/**\n * @param {string} options\n */')).toBe(false);
    expect(asksEngine('/** @typedef {object} Options */')).toBe(false);
    expect(asksEngine('/** Plain words. */\n/** @returns {string} */')).toBe(false);
    expect(asksEngine('/** @type {string} and no end')).toBe(false);
  });

  it('asks the engine when the comments declare no type', () => {
    expect(asksEngine('/** Plain words. */\n// @param {string} options')).toBe(true);
    expect(asksEngine('/* @param {string} options */')).toBe(true);
    expect(asksEngine('/** Plain words and no end')).toBe(true);
  });

  it('reads only scripts for typed comments', () => {
    expect(asksEngine('/** @param {string} options */', 'src/typed.ts')).toBe(true);
  });
});
