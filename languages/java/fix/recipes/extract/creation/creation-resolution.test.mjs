import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mjs';
import { urlAndUri } from '../test-support/creation-sources.mjs';

const PATH = 'src/main/java/demo/Adapters.java';
const EXCEPTION_USE = [
  'the catch body uses the exception where its type cannot be shared: only a call of a Throwable method',
  'or an argument of a new object whose class has one constructor of that size',
].join(' ');
const NOT_EXCEPTION = 'a differing catch type is not an Exception';
const UNCOVERED =
  'a constructor of a differing type throws a checked exception the catch clause does not cover';

function reasons(text, root = '/nonexistent') {
  const { fixes, notes } = recipe.plan({
    files: [{ path: PATH, text }],
    projectRoot: root,
  });
  return { fixes: fixes.length, notes: notes.map((note) => note.split('near-duplicate: ').at(-1)) };
}

function wrapping(members, after = '') {
  const text = urlAndUri({
    url: { handler: 'throw new Wrap(e);' },
    uri: { handler: 'throw new Wrap(e);' },
  });
  return `${text.replace('final class Adapters {\n', `final class Adapters {\n${members}`)}${after}`;
}

const TWO = `class Wrap extends IOException {
    Wrap(Exception e) {}
    Wrap(MalformedURLException e) {}
}
`;
const ONE = `class Wrap extends IOException {
    Wrap(Exception e) {}
}
`;
const NESTED = (body) => `    static final class Holder {\n        ${body}\n    }\n`;

describe('javaExtractNearDuplicateRecipe resolves the constructors of the catch body', () => {
  it('counts constructors after a brace in a char literal', () => {
    const members = `    static final class Wrap extends IOException {
        Wrap(Exception e) { char open = '{'; }
        Wrap(MalformedURLException e) {}
    }
`;
    expect(reasons(wrapping(members))).toEqual({ fixes: 0, notes: [EXCEPTION_USE] });
  });

  it('does not take a member class of another class for the top-level one', () => {
    const nested = NESTED(ONE.replace('class', 'static final class'));
    expect(reasons(wrapping(nested, TWO))).toEqual({ fixes: 0, notes: [EXCEPTION_USE] });
  });

  it('uses the single-constructor class that the name resolves to', () => {
    const nested = NESTED(TWO.replace('class', 'static final class'));
    expect(reasons(wrapping(nested, ONE))).toEqual({ fixes: 1, notes: [] });
  });

  it('declines a class that cannot be found', () => {
    expect(reasons(wrapping('', ''))).toEqual({ fixes: 0, notes: [EXCEPTION_USE] });
  });

  it.each([
    ['Throwable', 'Throwable'],
    ['Error', 'Error'],
  ])('declines a catch hole of %s', (_name, type) => {
    const text = urlAndUri({ url: { catches: type }, uri: { catches: 'URISyntaxException' } });
    expect(reasons(text)).toEqual({ fixes: 0, notes: [NOT_EXCEPTION] });
  });

  it('declines a tied catch that does not cover the constructor exception', () => {
    const text = urlAndUri({ url: { catches: 'IOException' } });
    expect(reasons(text)).toEqual({ fixes: 0, notes: [UNCOVERED] });
  });

  it('looks past a superclass of another file that declares no such member', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-creation-'));
    try {
      mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
      const base =
        'package demo;\n\nabstract class Adapter<T> {\n    abstract T read(String in);\n}\n';
      writeFileSync(path.join(root, 'src/main/java/demo/Adapter.java'), base);
      const text = wrapping(ONE.replace('class', 'static final class'));
      const shared = text.replace(/abstract class Adapter<T> \{[^}]*\}\n\n/u, '');
      expect(reasons(shared, root)).toEqual({ fixes: 1, notes: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
