import { braceDepths } from '../../kotlin-source.mjs';
import {
  classBodies,
  isCloseName,
  memberFunctions,
  statementsOf,
} from '../scopes/kotlin-scopes.mjs';

const RULE = 'CleanupSkippedOnFailure';
const HEADER_LOOKBEHIND = 120;
const RELEASES =
  'close|disconnect|destroy|shutdown|shutdownNow|stop|terminate|unsubscribe|dispose|quit';
const THROWING = 'close|disconnect|destroy|stop|terminate|unsubscribe|dispose|quit';
const RELEASE_STATEMENT = new RegExp(String.raw`^[\w.?!]+\s*\??\.\s*(?:${RELEASES})\s*\(\s*\)$`);
const THROWING_STATEMENT = new RegExp(String.raw`^[\w.?!]+\s*\??\.\s*(?:${THROWING})\s*\(\s*\)$`);
const RESET_STATEMENT =
  /^[\w.]+\s*=\s*(?:null|emptyList\(\)|emptyMap\(\)|mutable\w+Of\(\))$|^[\w.?!]+\s*\??\.\s*clear\s*\(\s*\)$/;
const TEST_HOOK = /@(?:After(?:Each|All|Class)?|PreDestroy)\b/;

const MESSAGES = {
  [RULE]:
    'This release can throw, so the release or reset after it in the same block never runs and a connection stays open or the state is not reset. Release each resource in `use` or try/finally (or catch each release and rethrow the first failure after the rest ran). An exception fits only when a failed release should abort the remaining ones.',
};

function cleanupFunctions(code) {
  const depths = braceDepths(code);
  const scopes = [{ open: -1, end: code.length }, ...classBodies(code)];
  return scopes.flatMap((scope) => memberFunctions(code, scope, depths));
}

function isCleanup(code, fn) {
  const before = code.slice(Math.max(0, fn.offset - HEADER_LOOKBEHIND), fn.offset);
  const header = before.slice(before.lastIndexOf('\n\n') + 1);
  return isCloseName(fn.name) || TEST_HOOK.test(header);
}

function splitStatements(statements) {
  return statements.flatMap((statement) =>
    statement.text
      .split(/;\s*/)
      .filter((text) => text !== '')
      .map((text) => ({ ...statement, text })),
  );
}

function firstSkipped(statements) {
  return statements.find(
    (statement, index) =>
      THROWING_STATEMENT.test(statement.text) &&
      !statements.slice(0, index).some((earlier) => RELEASE_STATEMENT.test(earlier.text)) &&
      statements
        .slice(index + 1)
        .some((later) => RELEASE_STATEMENT.test(later.text) || RESET_STATEMENT.test(later.text)),
  );
}

export function cleanupSkippedOnFailure(scanned) {
  const { code } = scanned;
  return cleanupFunctions(code)
    .filter((fn) => isCleanup(code, fn))
    .map((fn) => firstSkipped(splitStatements(statementsOf(code, fn))))
    .filter((statement) => statement !== undefined)
    .map(({ offset }) => ({ rule: RULE, offset }));
}

export const kotlinSourceRules = { messages: MESSAGES, main: [cleanupSkippedOnFailure] };
