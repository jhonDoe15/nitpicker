import { docsUrl } from '../../shared/messages/docs-url.mjs';
import { packageVersion } from './package-version.mjs';
import { projectAnalyzers } from './project-analyzers.mjs';
import { usageText } from './usage-text.mjs';

const USAGE_PAGE = 'docs/usage.md';

/** The help of the project at or above `currentProjectRoot`, with the docs of this package's version. */
export function projectUsageText(currentProjectRoot) {
  return usageText({
    analyzers: projectAnalyzers(currentProjectRoot),
    referenceUrl: docsUrl(USAGE_PAGE),
  });
}

export function printedInformation(options, { stdout, currentProjectRoot }) {
  if (options.help) {
    stdout.write(projectUsageText(currentProjectRoot));
    return true;
  }
  if (options.version) {
    stdout.write(`${packageVersion()}\n`);
    return true;
  }
  return false;
}
