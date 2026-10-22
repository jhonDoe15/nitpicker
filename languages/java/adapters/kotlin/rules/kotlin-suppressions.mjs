import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionHint } from '../../../../../shared/rules/exceptions.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import { LITERAL_MARK, maskKotlinSource } from './kotlin-literals.mjs';
import { compilerWarningRule, isBannedSuppression, SUPPRESSION_RULE } from './kotlin-rules.mjs';

const SUPPRESS_ANNOTATION =
  /@\[?(?:\w+:)?(?:(?:kotlin|java\.lang)\.)?Suppress(?:Warnings)?\s*\(((?:"[^"]*"|[^")])*)\)/g;

export function suppressionTokens(source) {
  const { code, literals } = maskKotlinSource(source);
  return [...code.matchAll(SUPPRESS_ANNOTATION)].flatMap(([, argumentText]) =>
    [...argumentText.matchAll(LITERAL_MARK)].map(([, index]) => literals[Number(index)]),
  );
}

export function kotlinFiles(projectRoot, sourceRoot) {
  if (!existsSync(path.join(projectRoot, sourceRoot))) {
    return [];
  }
  return readdirSync(path.join(projectRoot, sourceRoot), { recursive: true })
    .filter((entry) => entry.endsWith('.kt'))
    .map((entry) => path.posix.join(sourceRoot, entry.replaceAll('\\', '/')));
}

function suppressionMessage(file, token) {
  const compilerRule = compilerWarningRule(token);
  if (compilerRule !== undefined) {
    return `Suppressing "${token}" inline is not allowed. Fix the code the compiler warns about. ${exceptionHint(compilerRule, file)}`;
  }
  return `Suppressing "${token}" inline is not allowed. Fix the code the rule flags. To lift a one-way rule for some paths, add an "exceptions" entry for it in nitpicker.config.json; to skip generated code, add it to "exclude" there.`;
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

export function readSuppressionFindings(projectRoot, sourceRoots) {
  return [...new Set(sourceRoots.flatMap((root) => kotlinFiles(projectRoot, root)))]
    .toSorted()
    .flatMap((file) => {
      const next = createIdentityCounter();
      return suppressionTokens(readFileSync(path.join(projectRoot, file), 'utf8'))
        .filter(isBannedSuppression)
        .map((token) => suppressionFinding(file, token, next(`suppress:${token}`)));
    });
}
