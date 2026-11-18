import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blankLiterals, pathInside, sourceFilesUnder } from '../../review-rules/java-sources.mts';
import { closingIndex } from '../../kotlin/scan/kotlin-brackets.mts';
import { lineOf } from '../wiring/spring-wiring.mts';
import { handlerParameters } from './handler-parameters.mts';
import {
  callBefore,
  isArgument,
  isControlWord,
  isIdentifierName,
  isLookup,
  isTrimmedLine,
} from './lookup-calls.mts';
import type { SpringProblem } from '../typed/spring-types.mts';
import type { HandlerParameter, HelperInfo, Occurrence, SourceFile } from './request-types.mts';
import { escapeRegExp } from '../typed/shared-views.mts';

const SOURCE_EXTENSIONS = ['.java', '.kt'];
const TRIMMER = /\bStringTrimmerEditor\b/u;
const ADVICE = /@\s*(?:Rest)?ControllerAdvice\b/u;
const INIT_BINDER = /@\s*InitBinder\b/u;
const CONTROLLER = /@\s*(?:Rest)?Controller\b/u;
const WHITESPACE = /\s+/gu;
const MESSAGE = [
  'before the lookup: call strip() on it, or register one StringTrimmerEditor',
  'in an @InitBinder of a @ControllerAdvice so every handler gets trimmed text.',
].join(' ');

function readSources(projectRoot: string, roots: readonly string[]): SourceFile[] {
  return roots
    .flatMap((root) => sourceFilesUnder(pathInside(projectRoot, root), SOURCE_EXTENSIONS))
    .map((file) => ({
      path: path.relative(projectRoot, file).split(path.sep).join('/'),
      code: blankLiterals(readFileSync(file, 'utf8')),
    }));
}

function helpersOf(code: string, kotlin: boolean): Map<string, HelperInfo> {
  const pattern = kotlin
    ? /\bfun\s+(?:<[^>]*>\s*)?(\w+)\s*\(([^()]*)\)[^={;]*\{/gu
    : /\b(\w+)\s*\(([^()]*)\)\s*(?:throws\s[\w.,\s]+)?\{/gu;
  const parameterName = kotlin ? /(\w+)\s*:/u : /(\w+)\s*$/u;
  const helpers = new Map<string, HelperInfo>();
  for (const match of code.matchAll(pattern)) {
    const open = match.index + match[0].length - 1;
    const helper = match[1] ?? '';
    const parameters = (match[2] ?? '').split(',').map((part) => parameterName.exec(part)?.[1]);
    const known = isControlWord(helper) || helpers.has(helper);
    if (!known) {
      helpers.set(helper, { parameters, body: code.slice(open, closingIndex(code, open) + 1) });
    }
  }
  return helpers;
}

function referencePattern({ kind, name }: HandlerParameter): RegExp {
  return kind === 'param'
    ? new RegExp(String.raw`\b${escapeRegExp(name)}\b(?:\s*!!)?`, 'gu')
    : new RegExp(
        String.raw`\b${escapeRegExp(name)}\s*\.\s*(?:get([A-Z]\w*)\s*\(\s*\)|([a-z]\w*)(?:\s*\(\s*\))?(?![\w(]))`,
        'gu',
      );
}

function aliasHits(body: string, use: Occurrence): Occurrence[] {
  const text = use.text
    .split(WHITESPACE)
    .map(escapeRegExp)
    .join(String.raw`\s*`);
  const alias = new RegExp(String.raw`(\w+)\s*=\s*${text}\s*[;\n]`, 'gu');
  return [...body.matchAll(alias)].flatMap((match) =>
    [...body.matchAll(new RegExp(String.raw`\b${escapeRegExp(match[1] ?? '')}\b`, 'gu'))].map(
      (hit) => ({
        index: hit.index,
        text: use.text,
        field: use.field,
        name: match[1] ?? '',
        alias: true,
      }),
    ),
  );
}

function occurrences(parameter: HandlerParameter): Occurrence[] {
  const { body } = parameter;
  const direct = [...body.matchAll(referencePattern(parameter))].map((match) => ({
    index: match.index,
    text: match[0],
    field: parameter.kind === 'param' ? parameter.name : (match[1] ?? match[2] ?? ''),
    name: parameter.name,
  }));
  return [...direct, ...direct.flatMap((use) => aliasHits(body, use))];
}

function reportedUse(
  parameter: HandlerParameter,
  helpers: ReadonlyMap<string, HelperInfo>,
): string | undefined {
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

function problemsIn({ path: file, code }: SourceFile): SpringProblem[] {
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

export function untrimmedRequestTextProblems(
  projectRoot: string,
  sourceRoots: readonly string[],
): SpringProblem[] {
  const files = readSources(projectRoot, sourceRoots);
  const registers = files.filter(({ code }) => TRIMMER.test(code) && INIT_BINDER.test(code));
  if (registers.some(({ code }) => ADVICE.test(code))) {
    return [];
  }
  return files
    .filter((file) => CONTROLLER.test(file.code) && !registers.includes(file))
    .flatMap(problemsIn);
}
