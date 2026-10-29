import { pinnedToolTextVersion } from '../../languages/java/reference/tool-text/tool-text.mjs';
import { readRuffSnapshot } from '../../languages/python/reference/ruff-entries.mjs';

const LGPL_NOTE = (tool) =>
  `${tool} is under the LGPL-2.1, so this page names each rule and its category only; the description is in the documentation each entry links to.`;
const ESLINT_CREDIT =
  'The summaries of the ESLint rules are the `meta.docs.description` of each rule, from ESLint, typescript-eslint and the plugins, all under the MIT License.';

/** The line of each page that names the tool whose own text the page quotes, and its licence. */
export function pageCredits() {
  return {
    'java-pmd': `The descriptions of PMD's own rules are from PMD ${pinnedToolTextVersion('pmd')}, under its BSD-style licence.`,
    'java-errorprone': `The summaries are from Error Prone and NullAway ${pinnedToolTextVersion('errorprone')}: Error Prone is under the Apache License 2.0 and NullAway under the MIT License.`,
    'java-spotbugs': LGPL_NOTE(`SpotBugs ${pinnedToolTextVersion('spotbugs')}`),
    'java-checkstyle': LGPL_NOTE(`Checkstyle ${pinnedToolTextVersion('checkstyle')}`),
    'kotlin-detekt': `The descriptions of detekt's rules are from detekt ${pinnedToolTextVersion('detekt')}, under the Apache License 2.0.`,
    'python-ruff': `The descriptions and examples are from the documentation of ruff ${readRuffSnapshot().version}, under the MIT License.`,
    'typescript-eslint': ESLINT_CREDIT,
    'typescript-plugins': ESLINT_CREDIT,
  };
}
