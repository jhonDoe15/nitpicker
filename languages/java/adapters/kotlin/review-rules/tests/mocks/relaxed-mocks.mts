import type { KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { FindingFactory, ReviewFinding } from '../../typed/review-finding-types.mts';

type IsProduction = (type: string, file: KotlinFile) => boolean;
type RelaxedOptions = { finding: FindingFactory; projectRoot: string; isProduction: IsProduction };
import path from 'node:path';
import { readText } from '../typed/read-text.mts';
import { lineOf, scanKotlinSource } from '../../../scan/kotlin-source.mts';
import { mockSites, subjectsOf, type MockSite } from './mock-sites.mts';

export const RELAXED_MOCK_RULE = 'RelaxedMockInTest';
const MOCKK_IMPORT = /^[ \t]*import\s+(?:io\.mockk|com\.ninjasquad\.springmockk)\./mu;

export function relaxedMessage(type: string): string {
  return `This relaxed mock of ${type} answers every call it was not told about with a default value (0, "", an empty list, another mock), so the code under test runs on made-up results and the test passes when ${type} changes. Stub the calls the test needs on a plain mockk<${type}>() (every { ... } returns ...), use relaxUnitFun = true when only Unit calls are left out, or pass a fake.`;
}

function relaxedSites(code: string, file: KotlinFile, isProduction: IsProduction): MockSite[] {
  const subjects = subjectsOf(code);
  return mockSites(code)
    .filter(
      (site) =>
        site.relaxed && !site.spy && !subjects.has(site.type) && isProduction(site.type, file),
    )
    .toSorted((left, right) => left.offset - right.offset);
}

export function relaxedMockFindings(
  files: KotlinFile[],
  { finding, projectRoot, isProduction }: RelaxedOptions,
): ReviewFinding[] {
  return files
    .filter(({ test }) => test)
    .flatMap((file) => {
      const text = readText(projectRoot, file.file);
      if (text === undefined || !MOCKK_IMPORT.test(text)) {
        return [];
      }
      const scanned = scanKotlinSource(text);
      const symbol = path.posix.basename(file.file, '.kt');
      return relaxedSites(scanned.code, file, isProduction).map((site) =>
        finding({
          rule: RELAXED_MOCK_RULE,
          file: file.file,
          line: lineOf(scanned, site.offset),
          symbol,
          key: `${symbol}:${site.name ?? site.type}`,
          message: relaxedMessage(site.type),
        }),
      );
    });
}
