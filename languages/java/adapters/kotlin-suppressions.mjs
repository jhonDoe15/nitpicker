import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter } from '../ingest/common.mjs';
import { isBannedSuppression, SUPPRESSION_RULE } from './kotlin-rules.mjs';

const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const SUPPRESS_ANNOTATION =
  /@(?:file:)?(?:(?:kotlin|java\.lang)\.)?Suppress(?:Warnings)?\s*\(((?:"(?:[^"\\]|\\.)*"|[^")])*)\)/g;
const STRING_LITERAL = /"((?:[^"\\]|\\.)*)"/g;

export function suppressionTokens(source) {
  const code = source.replace(COMMENTS, '');
  return [...code.matchAll(SUPPRESS_ANNOTATION)].flatMap(([, argumentText]) =>
    [...argumentText.matchAll(STRING_LITERAL)].map(([, token]) => token),
  );
}

function kotlinFiles(projectRoot, sourceRoot) {
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
    message: `Suppressing "${token}" inline hides a rule nitpicker enforces. Fix the code the rule flags; to allow a rule on specific paths, add an "exceptions" entry for it in nitpicker.config.json.`,
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
