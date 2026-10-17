import path from 'node:path';
import { MESSAGES, renderMessage } from '../../../../../shared/policy.mjs';
import { exceptionText } from '../../../../../shared/rules/exceptions.mjs';
import { UNUSED_API_RULE_IDS } from '../../../../../shared/unused-api/unused-api-policy.mjs';
import { entriesOf, keyOf } from './knip-report.mjs';
import { reexportedTestOnlyEntries } from './reexported-exports.mjs';

const TEST_SUPPORT = /(?:^|\/)test-support\//u;
const RULE = UNUSED_API_RULE_IDS.testOnlyExport;

function templateFor({ category, reexportedBy }) {
  if (category === 'files') {
    return MESSAGES.testOnlyModule;
  }
  return reexportedBy === undefined ? MESSAGES.testOnlyExport : MESSAGES.testOnlyReexport;
}

function finding(item, analyzerName) {
  const { file, category, entry, reexportedBy } = item;
  return {
    tool: analyzerName,
    rule: RULE,
    path: file,
    identity: `${category}:${entry.name}`,
    message: renderMessage(templateFor(item), {
      name: entry.name,
      reexporter: reexportedBy,
      exception: exceptionText(RULE, file),
    }),
    classification: 'enforceable',
    symbol: entry.name,
    ...(Number.isInteger(entry.line) ? { location: { line: entry.line } } : {}),
  };
}

function isPublishedFile(packagesInfo, absoluteFile) {
  return packagesInfo.packageOf(absoluteFile)?.published === true;
}

export function needsProductionRun(packagesInfo, projectRoot) {
  const ownPackageIsPublished = isPublishedFile(
    packagesInfo,
    path.join(projectRoot, 'package.json'),
  );
  return !ownPackageIsPublished || packagesInfo.packages.some(({ published }) => !published);
}

function isJudged(item, { packagesInfo, context }) {
  return (
    !(item.category === 'files' && TEST_SUPPORT.test(item.file)) &&
    !isPublishedFile(packagesInfo, path.join(context.projectRoot, item.file)) &&
    !context.isExcepted(RULE, item.file)
  );
}

/**
 * The exports, types and modules that knip reports once tests are left out but not in its normal
 * run: nothing in production code imports them, and a test does. A re-export is not an import:
 * knip counts one from an entry as a use, so the exports it keeps alive count too (see
 * `reexported-exports.mjs`). Modules under `test-support/` are meant for tests, and a published
 * package's own tests count as callers, so neither is judged.
 */
export function testOnlyExportFindings({
  normal,
  production,
  entryExportsRun,
  packagesInfo,
  context,
}) {
  const unusedEverywhere = new Set(entriesOf(normal).map(keyOf));
  const reexported = reexportedTestOnlyEntries({
    production,
    entryExportsRun,
    packagesInfo,
    layout: context.layout,
    projectRoot: context.projectRoot,
    entryPatterns: context.entryPatterns,
  });
  return [
    ...entriesOf(production).filter((item) => !unusedEverywhere.has(keyOf(item))),
    ...reexported,
  ]
    .filter((item) => isJudged(item, { packagesInfo, context }))
    .map((item) => finding(item, context.analyzerName));
}
