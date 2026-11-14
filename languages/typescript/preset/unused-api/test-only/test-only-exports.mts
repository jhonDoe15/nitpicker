import path from 'node:path';
import type { Finding } from '../../../../../shared/values/findings.mts';
import type { PackagesInfo } from '../workspace/workspace-types.mts';
import { entriesOf, keyOf } from './knip-report.mts';
import type { KnipReport } from './typed/knip-types.mts';
import { type ReexportLayout, reexportedTestOnlyEntries } from './reexported-exports.mts';
import { TYPESCRIPT_TEST_ONLY_MESSAGES, testOnlyFindings } from './typed/judgement-views.mts';

function isPublishedFile(packagesInfo: PackagesInfo, absoluteFile: string): boolean {
  return packagesInfo.packageOf(absoluteFile)?.published === true;
}

export function needsProductionRun(packagesInfo: PackagesInfo, projectRoot: string): boolean {
  const ownPackageIsPublished = isPublishedFile(
    packagesInfo,
    path.join(projectRoot, 'package.json'),
  );
  return !ownPackageIsPublished || packagesInfo.packages.some(({ published }) => !published);
}

export function testOnlyExportFindings({
  normal,
  production,
  entryExportsRun,
  packagesInfo,
  context,
}: {
  normal: KnipReport;
  production: KnipReport;
  entryExportsRun: () => KnipReport;
  packagesInfo: PackagesInfo;
  context: {
    layout: ReexportLayout;
    projectRoot: string;
    entryPatterns: readonly string[];
    analyzerName: string;
    isExcepted: (rule: string, ...candidates: readonly unknown[]) => boolean;
  };
}): Finding[] {
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
