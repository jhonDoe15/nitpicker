import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeUri, prepareSarif } from '../../../../../../shared/ingest/sarif.mts';
import { escapeRegExp } from '../../../../../../shared/paths/glob.mts';
import {
  fieldOf,
  isPlainObject,
  listOf,
  type Fields,
} from '../../../../../../shared/values/readers.mts';
import { isRuleCrashText } from './pmd-rule-crashes.mts';

type SarifRoots = {
  readonly roots: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly projectRoot: string;
};
type ProcessingOptions = SarifRoots & { readonly loggedCrashFiles?: ReadonlySet<string> };

type PmdProcessingError = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
};

const RULE = 'processing-error';
const MAX_CAUSE_LENGTH = 240;

function firstLine(text: string): string {
  const line = text
    .split(/\r?\n/u)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate !== '');
  return line ?? 'no message';
}

function shortened(cause: string): string {
  const points = Array.from(cause);
  return points.length > MAX_CAUSE_LENGTH
    ? `${points.slice(0, MAX_CAUSE_LENGTH).join('')}...`
    : cause;
}

function rootPrefix(root: string): RegExp {
  const folders = root
    .split(/[/\\]/u)
    .map(escapeRegExp)
    .join(String.raw`[/\\]`);
  return new RegExp(String.raw`(?<![\w./\\-])${folders}[/\\]`, 'gu');
}

function withoutRoots(cause: string, roots: readonly string[]): string {
  return [...new Set(roots)]
    .filter((root) => root.length > 1)
    .toSorted((left, right) => right.length - left.length)
    .map(rootPrefix)
    .reduce((text, prefix) => text.replaceAll(prefix, ''), cause);
}

function notificationsOf(log: unknown): readonly unknown[] {
  return listOf(fieldOf(log, 'runs')).flatMap((run) =>
    listOf(fieldOf(run, 'invocations')).flatMap((invocation) =>
      listOf(fieldOf(invocation, 'toolExecutionNotifications')),
    ),
  );
}

function messageText(notification: Fields): string {
  const text = fieldOf(notification['message'], 'text');
  return isPlainObject(notification['message']) && typeof text === 'string' ? text : '';
}

function asResult(notification: Fields): Fields {
  return {
    ruleId: RULE,
    message: { text: messageText(notification) },
    locations: listOf(notification['locations']).filter(isPlainObject).slice(0, 1),
  };
}

function relativePath(prepared: unknown): string {
  const location = listOf(fieldOf(prepared, 'locations'))[0];
  const uri = fieldOf(fieldOf(fieldOf(location, 'physicalLocation'), 'artifactLocation'), 'uri');
  return typeof uri === 'string' && normalizeUri(uri) !== undefined && !uri.startsWith('file:')
    ? uri
    : '.';
}

function notifiedFile(notification: Fields, projectRoot: string): string | undefined {
  const location = listOf(notification['locations'])[0];
  const uri = fieldOf(fieldOf(fieldOf(location, 'physicalLocation'), 'artifactLocation'), 'uri');
  if (typeof uri !== 'string') {
    return undefined;
  }
  return uri.startsWith('file:') ? fileURLToPath(uri) : path.resolve(projectRoot, uri);
}

function isLoggedRuleCrash(
  notification: Fields,
  loggedCrashFiles: ReadonlySet<string>,
  projectRoot: string,
): boolean {
  const file = notifiedFile(notification, projectRoot);
  return (
    isRuleCrashText(messageText(notification)) && file !== undefined && loggedCrashFiles.has(file)
  );
}

export function pmdProcessingErrors(
  log: unknown,
  { roots, sourceRoots, projectRoot, loggedCrashFiles = new Set<string>() }: ProcessingOptions,
): PmdProcessingError[] {
  const notifications = notificationsOf(log)
    .filter(isPlainObject)
    .filter((notification) => !isLoggedRuleCrash(notification, loggedCrashFiles, projectRoot));
  if (notifications.length === 0) {
    return [];
  }
  const prepared = prepareSarif(
    { runs: [{ results: notifications.map(asResult) }] },
    { roots, sourceRoots, projectRoot, identityKey: () => '' },
  );
  const results = listOf(fieldOf(listOf(prepared['runs'])[0], 'results'));
  const identities = new Set<string>();
  return notifications.flatMap((notification, index) => {
    const filePath = relativePath(results[index]);
    const cause = shortened(
      withoutRoots(firstLine(messageText(notification)), [...roots, projectRoot]),
    );
    const identity = `${RULE}:${filePath}:${cause.replaceAll(/\d+/gu, '#')}`;
    if (identities.has(identity)) {
      return [];
    }
    identities.add(identity);
    return [
      {
        tool: 'pmd',
        rule: RULE,
        path: filePath,
        identity,
        message: `PMD could not process this file, so it has no PMD findings: ${cause}`,
        classification: 'descriptive',
      },
    ];
  });
}
