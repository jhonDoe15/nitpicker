import { describe, expect, it } from 'vitest';
import {
  appendSentence,
  escapeGlob,
  exceptionEntryText,
  exceptionSentence,
  hasExceptionRoute,
  insertBeforeRoute,
  isPlaceholderReason,
  retargetSentence,
} from './exception-sentence.mjs';

const ENTRY = '{"rule":"no-throw","paths":["src/a.ts"],"reason":"..."}';
const ROUTE = `If this is intended, add ${ENTRY} to "exceptions" in nitpicker.config.json.`;

describe('exceptionSentence', () => {
  it('names the entry and the list that takes it', () => {
    expect(exceptionSentence(ENTRY)).toBe(ROUTE);
    expect(exceptionSentence(ENTRY, 'python.exceptions')).toBe(
      `If this is intended, add ${ENTRY} to "python.exceptions" in nitpicker.config.json.`,
    );
  });

  it('is recognised at the end of a message, and nowhere else', () => {
    expect(hasExceptionRoute(`Do not throw. ${ROUTE}`)).toBe(true);
    expect(hasExceptionRoute(`${ROUTE} Then more.`)).toBe(false);
    expect(hasExceptionRoute('Do not throw.')).toBe(false);
  });
});

describe('exceptionEntryText', () => {
  it('prints the entry with the escaped path and the placeholder reason', () => {
    expect(exceptionEntryText({ rule: 'no-throw', path: 'src/[id]/{x}/a,b*?.ts' })).toBe(
      '{"rule":"no-throw","paths":["src/\\\\[id\\\\]/\\\\{x\\\\}/a\\\\,b\\\\*\\\\?.ts"],"reason":"..."}',
    );
  });

  it('adds the function, the name and the packages that narrow it', () => {
    expect(
      exceptionEntryText({
        rule: 'unused-dependency',
        glob: 'package.json',
        function: 'Store.save',
        name: 'helper',
        packages: ['left-pad'],
      }),
    ).toBe(
      '{"rule":"unused-dependency","paths":["package.json"],"packages":["left-pad"],"function":"Store.save","name":"helper","reason":"..."}',
    );
  });

  it('escapes a backslash so it is not read as a separator', () => {
    expect(escapeGlob('a\\b')).toBe('a\\\\b');
  });
});

describe('isPlaceholderReason', () => {
  it.each(['', ' ', '...', '..', '…', '-', '?!'])('treats %j as a placeholder', (reason) => {
    expect(isPlaceholderReason(reason)).toBe(true);
  });

  it.each(['fixture', 'x', '3 cases', 'Müll'])('treats %j as a reason', (reason) => {
    expect(isPlaceholderReason(reason)).toBe(false);
  });
});

describe('appendSentence', () => {
  it('ends the message with a full stop first, once', () => {
    expect(appendSentence('Do not throw', ROUTE)).toBe(`Do not throw. ${ROUTE}`);
    expect(appendSentence('Do not throw.  ', ROUTE)).toBe(`Do not throw. ${ROUTE}`);
  });

  it('keeps a message without a sentence as it is', () => {
    expect(appendSentence('Do not throw.', undefined)).toBe('Do not throw.');
  });
});

describe('insertBeforeRoute', () => {
  it('keeps the exception sentence last', () => {
    expect(insertBeforeRoute(`Do not throw. ${ROUTE}`, 'The base had 2.')).toBe(
      `Do not throw. The base had 2. ${ROUTE}`,
    );
  });

  it('adds to the end of a message with no route', () => {
    expect(insertBeforeRoute('Do not throw.', 'The base had 2.')).toBe(
      'Do not throw. The base had 2.',
    );
  });
});

describe('retargetSentence', () => {
  it('points the entry at the new file, folder glob or root', () => {
    const entry = (paths) => `{"rule":"folder-files-limit","paths":${paths},"reason":"..."}`;

    expect(retargetSentence(entry('["src/a"]'), 'src/a', 'lib/src/a')).toBe(entry('["lib/src/a"]'));
    expect(retargetSentence(entry('["src/a/**"]'), 'src/a', 'lib/src/a')).toBe(
      entry('["lib/src/a/**"]'),
    );
    expect(retargetSentence(entry('["src/a/*"]'), 'src/a', '.')).toBe(entry('["*"]'));
  });
});
