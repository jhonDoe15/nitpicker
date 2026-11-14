import { normalizeUri, prepareSarif } from '../../../../../../shared/ingest/sarif.mjs';
import { isRecord } from '../../../../../../shared/rules/facts/checks.mjs';

const RULE = 'processing-error';
const MAX_CAUSE_LENGTH = 240;

function firstLine(text) {
  const line = String(text ?? '')
    .split(/\r?\n/u)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate !== '');
  const cause = line ?? 'no message';
  return cause.length > MAX_CAUSE_LENGTH ? `${cause.slice(0, MAX_CAUSE_LENGTH)}...` : cause;
}

function notificationsOf(log) {
  return (Array.isArray(log?.runs) ? log.runs : []).flatMap((run) =>
    (Array.isArray(run?.invocations) ? run.invocations : []).flatMap((invocation) =>
      Array.isArray(invocation?.toolExecutionNotifications)
        ? invocation.toolExecutionNotifications
        : [],
    ),
  );
}

function messageText(notification) {
  return isRecord(notification.message) && typeof notification.message.text === 'string'
    ? notification.message.text
    : '';
}

function asResult(notification) {
  return {
    ruleId: RULE,
    message: { text: messageText(notification) },
    locations: (Array.isArray(notification.locations) ? notification.locations : [])
      .filter(isRecord)
      .slice(0, 1),
  };
}

function relativePath(prepared) {
  const uri = prepared.locations[0]?.physicalLocation?.artifactLocation?.uri;
  return typeof uri === 'string' && normalizeUri(uri) !== undefined && !uri.startsWith('file:')
    ? uri
    : '.';
}

export function pmdProcessingErrors(log, { roots, sourceRoots, projectRoot }) {
  const notifications = notificationsOf(log).filter(isRecord);
  if (notifications.length === 0) {
    return [];
  }
  const { results } = prepareSarif(
    { runs: [{ results: notifications.map(asResult) }] },
    { roots, sourceRoots, projectRoot, identityKey: () => '' },
  ).runs[0];
  const identities = new Set();
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
