import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { exceptionRoute } from '../../../../../shared/exceptions/rule-names.mjs';

export const MEMBER_FORWARDING_RULE = 'ForwardingMethodAlias';

export function memberAliasFinding({ file, symbol, target, line }) {
  return {
    tool: 'pmd',
    rule: MEMBER_FORWARDING_RULE,
    path: file,
    identity: `${MEMBER_FORWARDING_RULE}:${symbol}`,
    symbol,
    location: { line },
    classification: 'enforceable',
    message: `${symbol} only forwards unchanged parameters to ${target} on the same owner with the same contract. Call ${target} directly and delete the alias. ${exceptionRoute({ rule: `pmd/${MEMBER_FORWARDING_RULE}`, path: file })}`,
  };
}

function under(file, roots) {
  return roots.some(
    (root) => root === '' || root === '.' || file.startsWith(`${root.replace(/\/$/u, '')}/`),
  );
}

export function readJavaMemberAliases({ reportRoot, manifest }) {
  const report = path.join(reportRoot, 'classes.json');
  if (!existsSync(report)) {
    return [];
  }
  const { forwarders = [] } = JSON.parse(readFileSync(report, 'utf8'));
  return forwarders
    .filter(
      ({ file }) =>
        under(file, manifest.sourceRoots ?? []) && !under(file, manifest.testSourceRoots ?? []),
    )
    .map(memberAliasFinding);
}
