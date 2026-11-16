import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blankLiterals, pathInside, sourceFilesUnder } from '../../review-rules/java-sources.mjs';
import { closingIndex } from '../../kotlin/scan/kotlin-brackets.mjs';
import { lineOf } from '../wiring/spring-wiring.mjs';
import { handlerParameters } from './handler-parameters.mjs';
import {
  callBefore,
  isArgument,
  isControlWord,
  isIdentifierName,
  isLookup,
  isTrimmedLine,
} from './lookup-calls.mjs';

const SOURCE_EXTENSIONS = ['.java', '.kt'];
const TRIMMER = /\bStringTrimmerEditor\b/u;
const ADVICE = /@\s*(?:Rest)?ControllerAdvice\b/u;
const INIT_BINDER = /@\s*InitBinder\b/u;
const CONTROLLER = /@\s*(?:Rest)?Controller\b/u;
const ESCAPED = /[.*+?^${}()|[\]\\]/gu;
const WHITESPACE = /\s+/gu;
const MESSAGE = [
  'before the lookup: call strip() on it, or register one StringTrimmerEditor',
  'in an @InitBinder of a @ControllerAdvice so every handler gets trimmed text.',
].join(' ');

function readSources(projectRoot, roots) {
  return roots
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), SOURCE_EXTENSIONS))
    .map((file) => ({
      path: path.relative(projectRoot, file).split(path.sep).join('/'),
      code: blankLiterals(readFileSync(file, 'utf8')),
    }));
}

function helpersOf(code, kotlin) {
  const pattern = kotlin
    ? /\bfun\s+(?:<[^>]*>\s*)?(\w+)\s*\(([^()]*)\)[^={;]*\{/gu
    : /\b(\w+)\s*\(([^()]*)\)\s*(?:throws\s[\w.,\s]+)?\{/gu;
  const parameterName = kotlin ? /(\w+)\s*:/u : /(\w+)\s*$/u;
  const helpers = new Map();
  for (const match of code.matchAll(pattern)) {
    const open = match.index + match[0].length - 1;
    const parameters = match[2].split(',').map((part) => parameterName.exec(part)?.[1]);
    const known = isControlWord(match[1]) || helpers.has(match[1]);
    if (!known) {
      helpers.set(match[1], { parameters, body: code.slice(open, closingIndex(code, open) + 1) });
    }
  }
  return helpers;
}

function referencePattern({ kind, name }) {
  return kind === 'param'
    ? new RegExp(String.raw`\b${name}\b(?:\s*!!)?`, 'gu')
    : new RegExp(
        String.raw`\b${name}\s*\.\s*(?:get([A-Z]\w*)\s*\(\s*\)|([a-z]\w*)(?:\s*\(\s*\))?(?![\w(]))`,
        'gu',
      );
}

function aliasHits(body, use) {
  const text = use.text
    .replaceAll(ESCAPED, String.raw`\$&`)
    .replaceAll(WHITESPACE, String.raw`\s*`);
  const alias = new RegExp(String.raw`(\w+)\s*=\s*${text}\s*[;\n]`, 'gu');
  return [...body.matchAll(alias)].flatMap((match) =>
    [...body.matchAll(new RegExp(String.raw`\b${match[1]}\b`, 'gu'))].map((hit) => ({
      index: hit.index,
      text: use.text,
      field: use.field,
      name: match[1],
      alias: true,
    })),
  );
}

function occurrences(parameter) {
  const { body } = parameter;
  const direct = [...body.matchAll(referencePattern(parameter))].map((match) => ({
    index: match.index,
    text: match[0],
    field: parameter.kind === 'param' ? parameter.name : (match[1] ?? match[2]),
    name: parameter.name,
  }));
  return [...direct, ...direct.flatMap((use) => aliasHits(body, use))];
}

function reportedUse(parameter, helpers) {
  const { body } = parameter;
  const hits = occurrences(parameter);
  const use = hits.find(
    (hit) =>
      !isIdentifierName(hit.field) &&
      isArgument(body, hit.index, hit.alias ? hit.name.length : hit.text.length) &&
      isLookup(callBefore(body, hit.index), helpers),
  );
  const names = [...new Set(hits.map(({ name }) => name))];
  const trimmed = body.split('\n').some((line) => names.some((name) => isTrimmedLine(line, name)));
  return use === undefined || trimmed
    ? undefined
    : use.text.replaceAll(WHITESPACE, '').replace('!!', '');
}

function problemsIn({ path: file, code }) {
  const kotlin = file.endsWith('.kt');
  const helpers = helpersOf(code, kotlin);
  return handlerParameters(code, kotlin).flatMap((parameter) => {
    const use = reportedUse(parameter, helpers);
    return use === undefined
      ? []
      : [
          {
            path: file,
            line: lineOf(code, parameter.offset),
            key: `${parameter.method}.${parameter.name}`,
            message: `Trim ${use} ${MESSAGE}`,
          },
        ];
  });
}

export function untrimmedRequestTextProblems(projectRoot, sourceRoots) {
  const files = readSources(projectRoot, sourceRoots);
  const registers = files.filter(({ code }) => TRIMMER.test(code) && INIT_BINDER.test(code));
  if (registers.some(({ code }) => ADVICE.test(code))) {
    return [];
  }
  return files
    .filter((file) => CONTROLLER.test(file.code) && !registers.includes(file))
    .flatMap(problemsIn);
}
