import path from 'node:path';
import { MESSAGES, renderMessage } from '../../../../../shared/policy.mjs';
import { exceptionText } from '../../../../../shared/rules/exceptions.mjs';
import { UNUSED_API_RULE_IDS } from '../../../../../shared/unused-api/unused-api-policy.mjs';

const CATEGORIES = ['exports', 'types', 'files'];
const TEST_SUPPORT = /(?:^|\/)test-support\//u;
const RULE = UNUSED_API_RULE_IDS.testOnlyExport;

function entriesOf(report) {
  return (report.issues ?? []).flatMap((issue) =>
    CATEGORIES.flatMap((category) =>
      (issue[category] ?? []).map((entry) => ({ file: issue.file, category, entry })),
    ),
  );
}

function keyOf({ file, category, entry }) {
  return `${file}\0${category}\0${entry.name}`;
}

function finding({ file, category, entry }, analyzerName) {
  const isModule = category === 'files';
  const template = isModule ? MESSAGES.testOnlyModule : MESSAGES.testOnlyExport;
  return {
    tool: analyzerName,
    rule: RULE,
    path: file,
    identity: `${category}:${entry.name}`,
    message: renderMessage(template, { name: entry.name, exception: exceptionText(RULE, file) }),
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
 * run: nothing in production code imports them, and a test does. Modules under `test-support/`
 * are meant for tests, and a published package's own tests count as callers, so neither is judged.
 */
export function testOnlyExportFindings({ normal, production, packagesInfo, context }) {
  const unusedEverywhere = new Set(entriesOf(normal).map(keyOf));
  return entriesOf(production)
    .filter((item) => !unusedEverywhere.has(keyOf(item)))
    .filter((item) => isJudged(item, { packagesInfo, context }))
    .map((item) => finding(item, context.analyzerName));
}
