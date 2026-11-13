import path from 'node:path';
import { capture } from '../../common/matches.mts';
import type { Language, Tree } from '../../common/types.mts';
import { maskSource } from '../masking/mask.mts';
import { lineOfIndex } from '../text.mts';

const PATCH_BY_NAME =
  /\b(?:monkeypatch\.setattr|(?:mock\.|mocker\.|unittest\.mock\.)?patch)\s*\(\s*(['"])([\w.]+)\1/gu;
const PATCH_OBJECT =
  /\b(?:monkeypatch\.setattr|patch\.object)\s*\(\s*([\w.]+)\s*,\s*(['"])(\w+)\2/gu;
const TEST_NAME = /^(?:test_)?(.*?)(?:_test)?$/u;
const SUFFIX = /(?:Tests?|IT|Spec)$/u;

export type Mock = { target: string; line: number };

type Definitions = { found: boolean; names: Set<string>; classes: Set<string> };

function camelCase(name: string): string {
  return name.replaceAll(/(?:^|_)(\w)/gu, (_match, letter: string) => letter.toUpperCase());
}

function isIn(set: ReadonlySet<string>, value: string | undefined): boolean {
  return value !== undefined && set.has(value);
}

function definitionsOf({ stem, tree }: { stem: string; tree: Tree }): Definitions {
  const subject = [...tree.keys()].find(
    (file) =>
      !/(?:^|\/)(?:test_|tests?\/)/u.test(file) &&
      (file === `${stem}.py` ||
        file.endsWith(`/${stem}.py`) ||
        file.endsWith(`/${stem}/__init__.py`)),
  );
  const names = new Set<string>();
  const classes = new Set<string>();
  for (const match of (subject === undefined ? '' : (tree.get(subject) ?? '')).matchAll(
    /^(?:async\s+)?(def|class)\s+(\w+)|^(\w+)\s*[:=]/gmu,
  )) {
    const name = match[2] ?? match[3];
    if (name !== undefined) names.add(name);
    if (match[1] === 'class' && match[2] !== undefined) classes.add(match[2]);
  }
  return { found: subject !== undefined, names, classes };
}

function pythonMocks({ file, kept, tree }: { file: string; kept: string; tree: Tree }): Mock[] {
  const stem = TEST_NAME.exec(path.posix.basename(file, '.py'))?.[1] ?? '';
  const subjects = new Set([stem, camelCase(stem)]);
  const defined = definitionsOf({ stem, tree });
  if (!defined.found) return [];
  const named = [...kept.matchAll(PATCH_BY_NAME)].map((match) => {
    const segments = capture(match, 2).split('.');
    const rest = segments.slice(segments.lastIndexOf(stem) + 1);
    const inside =
      segments.includes(stem) &&
      (rest.length === 0 || (rest.length === 1 && isIn(defined.names, rest[0])));
    const ownClass =
      segments.includes(stem) && isIn(subjects, rest[0]) && isIn(defined.classes, rest[0]);
    return {
      target: capture(match, 2),
      line: lineOfIndex(kept, match.index),
      mocked: inside || ownClass,
    };
  });
  const objects = [...kept.matchAll(PATCH_OBJECT)].map((match) => {
    const owner = capture(match, 1).split('.').at(-1);
    const mocked =
      (owner === stem && defined.names.has(capture(match, 3))) ||
      (isIn(subjects, owner) && isIn(defined.classes, owner));
    return {
      target: `${capture(match, 1)}.${capture(match, 3)}`,
      line: lineOfIndex(kept, match.index),
      mocked,
    };
  });
  return [...named, ...objects].filter((mock) => mock.mocked);
}

function jvmMocks({ file, kept }: { file: string; kept: string }): Mock[] {
  const subject = path.posix
    .basename(file)
    .replace(/\.\w+$/u, '')
    .replace(SUFFIX, '');
  if (subject === '') return [];
  const pattern = new RegExp(
    String.raw`\b(?:mock|spy|mockStatic|mockkStatic|mockkObject|mockk|spyk)\s*[<(]\s*${subject}\b|` +
      String.raw`@(?:Mock|Spy|MockK|SpyK|MockBean|SpyBean)\b[^;=\n]*\b${subject}\b`,
    'gu',
  );
  return [...kept.matchAll(pattern)].map((match) => ({
    target: match[0].replaceAll(/\s+/gu, ' '),
    line: lineOfIndex(kept, match.index),
  }));
}

export function mockedSubjects({
  language,
  file,
  text,
  tree,
}: {
  language: Language;
  file: string;
  text: string;
  tree: Tree;
}): Mock[] {
  const kept = maskSource(language, text, { keepStrings: true }).masked;
  return language === 'python' ? pythonMocks({ file, kept, tree }) : jvmMocks({ file, kept });
}
