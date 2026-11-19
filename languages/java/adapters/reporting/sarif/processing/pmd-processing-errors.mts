import {
  normalizeUri as untypedNormalizeUri,
  prepareSarif as untypedPrepareSarif,
} from '../../../../../../shared/ingest/sarif.mjs';
import {
  fieldOf,
  isPlainObject,
  listOf,
  type Fields,
} from '../../../../../../shared/values/readers.mts';

type SarifRoots = {
  readonly roots: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly projectRoot: string;
};
type Prepared = { readonly runs: readonly { readonly results: readonly unknown[] }[] };

const normalizeUri: (uri: string) => string | undefined = untypedNormalizeUri;
const prepareSarif: (
  log: { readonly runs: readonly { readonly results: readonly Fields[] }[] },
  options: SarifRoots & { readonly identityKey: () => string },
) => Prepared = untypedPrepareSarif;

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
  const cause = line ?? 'no message';
  return cause.length > MAX_CAUSE_LENGTH ? `${cause.slice(0, MAX_CAUSE_LENGTH)}...` : cause;
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

export function pmdProcessingErrors(
  log: unknown,
  { roots, sourceRoots, projectRoot }: SarifRoots,
): PmdProcessingError[] {
  const notifications = notificationsOf(log).filter(isPlainObject);
  if (notifications.length === 0) {
    return [];
  }
  const results =
    prepareSarif(
      { runs: [{ results: notifications.map(asResult) }] },
      { roots, sourceRoots, projectRoot, identityKey: () => '' },
    ).runs[0]?.results ?? [];
  const identities = new Set<string>();
  return notifications.flatMap((notification, index) => {
    const filePath = relativePath(results[index]);
    const cause = firstLine(messageText(notification));
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
