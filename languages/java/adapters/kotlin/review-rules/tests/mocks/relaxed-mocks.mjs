import path from 'node:path';
import { readInside } from '../../../../../../../shared/conventions/read-inside.mjs';
import { lineOf, scanKotlinSource } from '../../../scan/kotlin-source.mjs';
import { mockSites, subjectsOf } from './mock-sites.mjs';

export const RELAXED_MOCK_RULE = 'RelaxedMockInTest';
const MOCKK_IMPORT = /^[ \t]*import\s+(?:io\.mockk|com\.ninjasquad\.springmockk)\./mu;

export function relaxedMessage(type) {
  return `This relaxed mock of ${type} answers every call it was not told about with a default value (0, "", an empty list, another mock), so the code under test runs on made-up results and the test passes when ${type} changes. Stub the calls the test needs on a plain mockk<${type}>() (every { ... } returns ...), use relaxUnitFun = true when only Unit calls are left out, or pass a fake.`;
}

function relaxedSites(code, file, isProduction) {
  const subjects = subjectsOf(code);
  return mockSites(code).filter(
    (site) =>
      site.relaxed === true &&
      !site.spy &&
      !subjects.has(site.type) &&
      isProduction(site.type, file),
  );
}

export function relaxedMockFindings(files, { finding, projectRoot, isProduction }) {
  return files
    .filter(({ test }) => test)
    .flatMap((file) => {
      const text = readInside(projectRoot, file.file, 'utf8');
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
