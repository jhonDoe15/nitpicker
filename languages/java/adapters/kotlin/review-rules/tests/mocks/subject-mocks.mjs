import path from 'node:path';
import { readInside } from '../../../../../../../shared/conventions/read-inside.mjs';
import { splitArguments } from '../../../scan/kotlin-brackets.mjs';
import { lineOf, scanKotlinSource } from '../../../scan/kotlin-source.mjs';
import {
  MOCKED_SUBJECT_RULE,
  STATIC_MOCK_RULE,
} from '../../../../../messages/mocks/project-mocks.mjs';
import { isStubbed, mockSites, scopeOf, subjectsOf } from './mock-sites.mjs';

const MOCKING_IMPORT = new RegExp(
  String.raw`^[ \t]*import\s+(?:io\.mockk|org\.mockito|com\.ninjasquad\.springmockk|org\.springframework\.(?:boot\.test\.mock|test\.context\.bean\.override))\.`,
  'mu',
);
const STATIC_CALLS = [
  'mockkObject',
  'mockkStatic',
  'mockkConstructor',
  'mockStatic',
  'mockConstruction',
].join('|');
const STATIC_CALL = new RegExp(
  String.raw`(?<![\w.]|\bfun\s+)(?:(?:Mockito|io\.mockk)\s*\.\s*)?(${STATIC_CALLS})\s*\(`,
  'gu',
);
const FIRST_ARGUMENT_ONLY = new Set(['mockStatic', 'mockConstruction']);
const CLASS_LITERAL = /^([\w.]+)::class(?:\.java)?$/u;
const FUNCTION_REFERENCE = /^([\w.]*)::(\w+)$/u;
const OBJECT_NAME = /^[A-Z]\w*(?:\.[A-Za-z]\w*)*$/u;
const STRING_LITERAL = /^"[^"]*"$/u;
const COMPANION = /\.Companion$/u;

export function subjectMessage(type) {
  return `This test mocks ${type}, the class it tests, so it checks the mock instead of the code: a mock of it, or a spy whose own methods are stubbed (every, whenever, doReturn). Test the real object: pass fakes or mocks of its collaborators in through the constructor, and test a helper through the public method that calls it.`;
}

export function staticMessage(call, target) {
  return `${call} replaces ${target}, code of this project, for the whole test, so the test runs a fake of the project's own code and depends on how that code is called. Pass the dependency in instead: an instance, a function or a Clock the test can replace. Keep mockkStatic, mockkObject and mockStatic for library code that cannot be passed in.`;
}

function facadeOf(file) {
  const base = path.posix.basename(file.file, '.kt');
  return [file.package, `${base.charAt(0).toUpperCase()}${base.slice(1)}Kt`]
    .filter(Boolean)
    .join('.');
}

function staticTarget(text, scanned, part) {
  const trimmed = text.trim();
  const literal = CLASS_LITERAL.exec(trimmed);
  if (literal !== null) {
    return { kind: 'type', name: literal[1] };
  }
  const reference = FUNCTION_REFERENCE.exec(trimmed);
  if (reference !== null) {
    return reference[1] === ''
      ? { kind: 'function', name: reference[2] }
      : { kind: 'type', name: reference[1] };
  }
  if (STRING_LITERAL.test(trimmed)) {
    const found = scanned.literals.find(({ start }) => start >= part.start && start < part.end);
    return found === undefined ? undefined : { kind: 'facade', name: found.text };
  }
  return OBJECT_NAME.test(trimmed)
    ? { kind: 'type', name: trimmed.replace(COMPANION, '') }
    : undefined;
}

function projectChecks({ projectFiles, isProduction }) {
  const main = projectFiles.filter(({ test }) => !test);
  const facades = new Set(main.map(facadeOf));
  const functions = new Set(
    main
      .flatMap(({ functions }) => functions.filter(({ owner }) => owner === ''))
      .map(({ name }) => name),
  );
  return {
    type: (name, file) => isProduction(name, file),
    facade: (name, file) => facades.has(name) || isProduction(name, file),
    function: (name) => functions.has(name),
  };
}

function staticSites(scanned, file, checks) {
  const { code } = scanned;
  return [...code.matchAll(STATIC_CALL)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const { parts } = splitArguments(code, open);
    const used = FIRST_ARGUMENT_ONLY.has(match[1]) ? parts.slice(0, 1) : parts;
    const seen = new Set();
    return used.flatMap((part) => {
      const target = staticTarget(code.slice(part.start, part.end), scanned, part);
      if (
        target === undefined ||
        seen.has(target.name) ||
        !checks[target.kind](target.name, file)
      ) {
        return [];
      }
      seen.add(target.name);
      const name = target.name.split('.').at(-1);
      return [
        {
          rule: STATIC_MOCK_RULE,
          offset: match.index,
          name,
          message: staticMessage(match[1], name),
        },
      ];
    });
  });
}

function subjectSites(scanned, file, checks) {
  const { code } = scanned;
  const subjects = subjectsOf(code);
  const seen = new Set();
  return mockSites(code).flatMap((site) => {
    const reported =
      subjects.has(site.type) &&
      checks.type(site.type, file) &&
      (!site.spy ||
        (site.name !== undefined &&
          isStubbed(site.local ? scopeOf(code, site.offset) : code, site.name)));
    const key = site.name ?? `@${String(site.offset)}`;
    if (!reported || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [
      {
        rule: MOCKED_SUBJECT_RULE,
        offset: site.offset,
        name: site.type,
        message: subjectMessage(site.type),
      },
    ];
  });
}

function symbolOf(file) {
  return path.posix.basename(file.file, '.kt');
}

export function subjectMockFindings(files, { finding, projectRoot, projectFiles, isProduction }) {
  const checks = projectChecks({ projectFiles, isProduction });
  return files
    .filter(({ test }) => test)
    .flatMap((file) => {
      const text = readInside(projectRoot, file.file, 'utf8');
      if (text === undefined || !MOCKING_IMPORT.test(text)) {
        return [];
      }
      const scanned = scanKotlinSource(text);
      const symbol = symbolOf(file);
      return [...subjectSites(scanned, file, checks), ...staticSites(scanned, file, checks)].map(
        (site) =>
          finding({
            rule: site.rule,
            file: file.file,
            line: lineOf(scanned, site.offset),
            symbol,
            key: `${symbol}:${site.name}`,
            message: site.message,
          }),
      );
    });
}
