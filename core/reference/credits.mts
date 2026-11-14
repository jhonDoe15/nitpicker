import { textOf } from '../../shared/values/readers.mts';
import { pinnedToolTextVersion } from '../../languages/java/reference/tool-text/tool-text.mjs';
import { readRuffSnapshot } from '../../languages/python/reference/ruff-entries.mjs';

const ruffSnapshot: () => { readonly version: unknown } = readRuffSnapshot;

function lgplNote(tool: string): string {
  return `${tool} is under the LGPL-2.1, so this page names each rule and its category only; the description is in the documentation each entry links to.`;
}

const ESLINT_CREDIT =
  'The summaries of the ESLint rules are the `meta.docs.description` of each rule, from ESLint, typescript-eslint and the plugins, all under the MIT License.';

export function pageCredits(): Readonly<Record<string, string>> {
  return {
    'java-pmd': `The descriptions of PMD's own rules are from PMD ${textOf(pinnedToolTextVersion('pmd'))}, under its BSD-style licence.`,
    'java-errorprone': `The summaries are from Error Prone and NullAway ${textOf(pinnedToolTextVersion('errorprone'))}: Error Prone is under the Apache License 2.0 and NullAway under the MIT License.`,
    'java-spotbugs': lgplNote(`SpotBugs ${textOf(pinnedToolTextVersion('spotbugs'))}`),
    'java-checkstyle': lgplNote(`Checkstyle ${textOf(pinnedToolTextVersion('checkstyle'))}`),
    'kotlin-detekt': `The descriptions of detekt's rules are from detekt ${textOf(pinnedToolTextVersion('detekt'))}, under the Apache License 2.0.`,
    'python-ruff': `The descriptions and examples are from the documentation of ruff ${textOf(ruffSnapshot().version)}, under the MIT License.`,
    'typescript-eslint': ESLINT_CREDIT,
    'typescript-plugins': ESLINT_CREDIT,
  };
}
