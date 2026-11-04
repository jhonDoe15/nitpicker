import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import { closingIndex } from '../scan/kotlin-source.mjs';
import { LITERAL_MARK, maskKotlinSource } from './kotlin-literals.mjs';
import {
  compilerWarningRule,
  isBannedSuppression,
  isUnusedCodeSuppression,
  SUPPRESSION_RULE,
} from './kotlin-rules.mjs';

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

function typeBody(code, keywordIndex) {
  const lineStart = code.lastIndexOf('\n', keywordIndex) + 1;
  const indent = keywordIndex - lineStart;
  const lines = code.slice(keywordIndex).split('\n');
  const header = [];
  for (const line of lines) {
    const indented = /^\s*/.exec(line)[0].length > indent;
    if (header.length > 0 && !indented && !STATEMENT_START.test(line)) {
      break;
    }
    header.push(line);
  }
  const text = header.join('\n');
  const open = text.indexOf('{');
  return open === -1 ? '' : text.slice(0, closingIndex(text, open) + 1);
}

function declarationSpan(code, keyword, keywordIndex) {
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

function hidesUnusedParameter({ code, start, end }) {
  if (FILE_TARGET.test(code.slice(start))) {
    return DECLARES_PARAMETERS.test(code);
  }
  const rest = code.slice(end);
  const afterAnnotations = end + LEADING.exec(rest)[0].length;
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

function suppressionUses(source) {
  const { code, literals } = maskKotlinSource(source);
  return [...code.matchAll(SUPPRESS_ANNOTATION)].flatMap((match) => {
    const [text, argumentText] = match;
    const annotation = { code, start: match.index, end: match.index + text.length };
    return [...argumentText.matchAll(LITERAL_MARK)].map(([, index]) => ({
      token: literals[Number(index)],
      annotation,
    }));
  });
}

export function suppressionTokens(source) {
  return suppressionUses(source).map(({ token }) => token);
}

export function kotlinFiles(projectRoot, sourceRoot) {
  if (!existsSync(path.join(projectRoot, sourceRoot))) {
    return [];
  }
  return readdirSync(path.join(projectRoot, sourceRoot), { recursive: true })
    .filter((entry) => entry.endsWith('.kt'))
    .map((entry) => path.posix.join(sourceRoot, entry.replaceAll('\\', '/')));
}

export function inlineSuppressionMessage(file, token) {
  if (isUnusedCodeSuppression(token)) {
    return `Suppressing "${token}" inline would hide an unused parameter. Remove the parameter, or use it; a name starting \`ignored\` or \`unused\` marks one a signature requires. When reflection or a framework calls it with that signature, remove the suppression and lift the rule for this path instead. ${exceptionHint('detekt.style.UnusedParameter', file)}`;
  }
  const compilerRule = compilerWarningRule(token);
  if (compilerRule !== undefined) {
    return `Suppressing "${token}" inline is not allowed. Fix the code the compiler warns about. ${exceptionHint(compilerRule, file)}`;
  }
  return `Suppressing "${token}" inline is not allowed. Fix the code the rule flags; to skip generated code, add it to "exclude" in nitpicker.config.json. ${exceptionHint(SUPPRESSION_RULE, file)}`;
}

function suppressionFinding(file, token, identity) {
  return {
    tool: 'detekt',
    rule: SUPPRESSION_RULE,
    path: file,
    identity,
    message: inlineSuppressionMessage(file, token),
    classification: 'enforceable',
  };
}

function filesOf(projectRoot, roots) {
  return [...new Set(roots.flatMap((root) => kotlinFiles(projectRoot, root)))].toSorted();
}

function isBanned({ token, annotation }, compiled) {
  if (isUnusedCodeSuppression(token)) {
    return compiled && hidesUnusedParameter(annotation);
  }
  return isBannedSuppression(token);
}

export function readSuppressionFindings(projectRoot, { sourceRoots, testRoots = [] }) {
  const compiled = new Set(filesOf(projectRoot, sourceRoots));
  return filesOf(projectRoot, [...sourceRoots, ...testRoots]).flatMap((file) => {
    const next = createIdentityCounter();
    return suppressionUses(readFileSync(path.join(projectRoot, file), 'utf8'))
      .filter((use) => isBanned(use, compiled.has(file)))
      .map(({ token }) => suppressionFinding(file, token, next(`suppress:${token}`)));
  });
}
