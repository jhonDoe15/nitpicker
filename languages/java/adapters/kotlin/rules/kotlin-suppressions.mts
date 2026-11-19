import { readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint as untypedExceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { createIdentityCounter as untypedCreateIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { closingIndex } from '../scan/kotlin-source.mts';
import { LITERAL_MARK, maskKotlinSource } from './kotlin-literals.mts';
import {
  compilerWarningRule,
  isBannedSuppression,
  isUnusedCodeSuppression,
  SUPPRESSION_RULE,
} from './kotlin-rules.mts';
import { projectFilePaths as untypedProjectFilePaths } from '../../../../../shared/project-files/project-files.mjs';

type Annotation = { code: string; start: number; end: number };
type Use = { token: string; annotation: Annotation };

const exceptionHint: (rule: string, path: string) => string = untypedExceptionHint;
const createIdentityCounter: () => (identity: string) => string = untypedCreateIdentityCounter;
const projectFilePaths: (root: string) => string[] = untypedProjectFilePaths;

const SUPPRESS_ANNOTATION =
  /@\[?(?:\w+:)?(?:(?:kotlin|java\.lang)\.)?Suppress(?:Warnings)?\s*\(((?:"[^"]*"|[^")])*)\)/g;

const ARGUMENTS = String.raw`\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)`;
const MODIFIERS =
  'public|private|protected|internal|open|final|abstract|override|suspend|inline|operator|infix|tailrec|external|expect|actual|data|sealed|enum|annotation|value|inner|companion|const|lateinit|vararg|noinline|crossinline';
const LEADING = new RegExp(
  String.raw`^\s*(?:(?:@\[?[\w.:]+\]?(?:${ARGUMENTS})?|\b(?:${MODIFIERS})\b)\s*)*`,
);
const FILE_TARGET = /^@file\s*:/;
const DECLARATION = /^(fun|class|object|interface|val|var|typealias)\b/;
const DECLARES_PARAMETERS = /\b(?:fun|constructor)\b[^({=]*\(\s*[^)\s]/;
const BODY_AFTER_SIGNATURE = /^\s*(?::[^={]*)?\{/;
const STATEMENT_START = /^\s*[}):,]|^\s*$/;

function typeBody(code: string, keywordIndex: number): string {
  const lineStart = code.lastIndexOf('\n', keywordIndex) + 1;
  const indent = keywordIndex - lineStart;
  const lines = code.slice(keywordIndex).split('\n');
  const header: string[] = [];
  for (const line of lines) {
    const indented = (/^\s*/.exec(line)?.[0] ?? '').length > indent;
    if (header.length > 0 && !indented && !STATEMENT_START.test(line)) {
      break;
    }
    header.push(line);
  }
  const text = header.join('\n');
  const open = text.indexOf('{');
  return open === -1 ? '' : text.slice(0, closingIndex(text, open) + 1);
}

function declarationSpan(code: string, keyword: string, keywordIndex: number): string {
  if (keyword !== 'fun') {
    return typeBody(code, keywordIndex);
  }
  const open = code.indexOf('(', keywordIndex);
  if (open === -1) {
    return '';
  }
  const close = closingIndex(code, open);
  const body = BODY_AFTER_SIGNATURE.exec(code.slice(close + 1));
  const end = body === null ? close + 1 : closingIndex(code, close + body[0].length) + 1;
  return code.slice(keywordIndex, end);
}

function hidesUnusedParameter({ code, start, end }: Annotation): boolean {
  if (FILE_TARGET.test(code.slice(start))) {
    return DECLARES_PARAMETERS.test(code);
  }
  const rest = code.slice(end);
  const afterAnnotations = end + (LEADING.exec(rest)?.[0] ?? '').length;
  const tail = code.slice(afterAnnotations);
  const keyword = DECLARATION.exec(tail)?.[1];
  if (keyword === undefined) {
    return true;
  }
  if (['val', 'var', 'typealias'].includes(keyword)) {
    return false;
  }
  return DECLARES_PARAMETERS.test(declarationSpan(code, keyword, afterAnnotations));
}

function suppressionUses(source: string): Use[] {
  const { code, literals } = maskKotlinSource(source);
  return [...code.matchAll(SUPPRESS_ANNOTATION)].flatMap((match) => {
    const [text = '', argumentText = ''] = match;
    const annotation = { code, start: match.index, end: match.index + text.length };
    return [...argumentText.matchAll(LITERAL_MARK)].map(([, index]) => ({
      token: literals[Number(index)] ?? '',
      annotation,
    }));
  });
}

export function suppressionTokens(source: string): string[] {
  return suppressionUses(source).map(({ token }) => token);
}

export function kotlinFiles(projectRoot: string, sourceRoot: string): string[] {
  return projectFilePaths(path.join(projectRoot, sourceRoot))
    .filter((entry) => entry.endsWith('.kt'))
    .map((entry) => path.posix.join(sourceRoot, entry));
}

const UNUSED_PARAMETER_FORM =
  'Remove the parameter, or use it; a name starting `ignored` or `unused` marks one a signature requires.';

export function inlineSuppressionMessage(
  file: string,
  token: string,
): { message: string; allowedForm: string } {
  if (isUnusedCodeSuppression(token)) {
    return {
      message: `Suppressing "${token}" inline would hide an unused parameter. ${UNUSED_PARAMETER_FORM} When reflection or a framework calls it with that signature, remove the suppression and lift the rule for this path instead. ${exceptionHint('detekt.style.UnusedParameter', file)}`,
      allowedForm: UNUSED_PARAMETER_FORM,
    };
  }
  const compilerRule = compilerWarningRule(token);
  const allowedForm =
    compilerRule === undefined
      ? 'Fix the code the rule flags; to skip generated code, add it to "exclude" in nitpicker.config.json.'
      : 'Fix the code the compiler warns about.';
  return {
    message: `Suppressing "${token}" inline is not allowed. ${allowedForm} ${exceptionHint(compilerRule ?? SUPPRESSION_RULE, file)}`,
    allowedForm,
  };
}

function suppressionFinding(file: string, token: string, identity: string): Finding {
  return {
    tool: 'detekt',
    rule: SUPPRESSION_RULE,
    path: file,
    identity,
    ...inlineSuppressionMessage(file, token),
    classification: 'enforceable',
  };
}

function filesOf(projectRoot: string, roots: readonly string[]): string[] {
  return [...new Set(roots.flatMap((root) => kotlinFiles(projectRoot, root)))].toSorted();
}

function isBanned({ token, annotation }: Use, compiled: boolean): boolean {
  if (isUnusedCodeSuppression(token)) {
    return compiled && hidesUnusedParameter(annotation);
  }
  return isBannedSuppression(token);
}

export function readSuppressionFindings(
  projectRoot: string,
  {
    sourceRoots,
    testRoots = [],
  }: { sourceRoots: readonly string[]; testRoots?: readonly string[] },
): Finding[] {
  const compiled = new Set(filesOf(projectRoot, sourceRoots));
  return filesOf(projectRoot, [...sourceRoots, ...testRoots]).flatMap((file) => {
    const next = createIdentityCounter();
    return suppressionUses(readFileSync(path.join(projectRoot, file), 'utf8'))
      .filter((use) => isBanned(use, compiled.has(file)))
      .map(({ token }) => suppressionFinding(file, token, next(`suppress:${token}`)));
  });
}
