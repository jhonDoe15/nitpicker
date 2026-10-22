import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';
import { appendSentence } from '../../../../../shared/messages/exception-sentence.mjs';
import { createIdentityCounter } from '../../../../../shared/ingest/common.mjs';
import { LITERAL_MARK, maskKotlinSource } from './kotlin-literals.mjs';
import { isBannedSuppression, SUPPRESSION_RULE } from './kotlin-rules.mjs';

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

function suppressionFinding(file, token, identity) {
  return {
    tool: 'detekt',
    rule: SUPPRESSION_RULE,
    path: file,
    identity,
    message: appendSentence(
      `Suppressing "${token}" inline is not allowed. Fix the code the rule flags; to skip generated code, add it to "exclude" in nitpicker.config.json.`,
      exceptionRoute({ rule: SUPPRESSION_RULE, path: file }),
    ),
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
