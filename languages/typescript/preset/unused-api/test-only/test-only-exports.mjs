import path from 'node:path';
import {
  TYPESCRIPT_TEST_ONLY_MESSAGES,
  testOnlyFindings,
} from '../../../../../shared/rules/test-only/test-only-judgement.mjs';
import { entriesOf, keyOf } from './knip-report.mjs';
import { reexportedTestOnlyEntries } from './reexported-exports.mjs';

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
  return testOnlyFindings(
    [...entriesOf(production).filter((item) => !unusedEverywhere.has(keyOf(item))), ...reexported],
    {
      analyzerName: context.analyzerName,
      isExcepted: context.isExcepted,
      isPublished: (file) => isPublishedFile(packagesInfo, path.join(context.projectRoot, file)),
      messages: TYPESCRIPT_TEST_ONLY_MESSAGES,
    },
  );
}
