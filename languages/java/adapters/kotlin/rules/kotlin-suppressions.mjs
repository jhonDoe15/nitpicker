import { readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import { LITERAL_MARK, maskKotlinSource } from './kotlin-literals.mjs';
import { compilerWarningRule, isBannedSuppression, SUPPRESSION_RULE } from './kotlin-rules.mjs';
import { projectFilePaths } from '../../../../../shared/project-files/project-files.mjs';

const SUPPRESS_ANNOTATION =
  /@\[?(?:\w+:)?(?:(?:kotlin|java\.lang)\.)?Suppress(?:Warnings)?\s*\(((?:"[^"]*"|[^")])*)\)/g;

export function suppressionTokens(source) {
  const { code, literals } = maskKotlinSource(source);
  return [...code.matchAll(SUPPRESS_ANNOTATION)].flatMap(([, argumentText]) =>
    [...argumentText.matchAll(LITERAL_MARK)].map(([, index]) => literals[Number(index)]),
  );
}

export function kotlinFiles(projectRoot, sourceRoot) {
  return projectFilePaths(path.join(projectRoot, sourceRoot))
    .filter((entry) => entry.endsWith('.kt'))
    .map((entry) => path.posix.join(sourceRoot, entry));
}

function suppressionMessage(file, token) {
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
    message: suppressionMessage(file, token),
    classification: 'enforceable',
  };
}

function filesOf(projectRoot, roots) {
  return [...new Set(roots.flatMap((root) => kotlinFiles(projectRoot, root)))].toSorted();
}

export function readSuppressionFindings(projectRoot, { sourceRoots, testRoots = [] }) {
  const compiled = new Set(filesOf(projectRoot, sourceRoots));
  return filesOf(projectRoot, [...sourceRoots, ...testRoots]).flatMap((file) => {
    const next = createIdentityCounter();
    return suppressionTokens(readFileSync(path.join(projectRoot, file), 'utf8'))
      .filter(
        (token) =>
          isBannedSuppression(token) &&
          (compilerWarningRule(token) === undefined || compiled.has(file)),
      )
      .map((token) => suppressionFinding(file, token, next(`suppress:${token}`)));
  });
}
