import { docsUrl } from '../../../shared/messages/docs-url.mjs';
import { packageVersion } from '../../help/package-version.mjs';
import { projectAnalyzers } from './project-analyzers.mjs';
import { usageText } from '../../help/usage-text.mjs';

const USAGE_PAGE = 'docs/usage.md';

/** The help for the project a run with `options` would check, linking this package version's docs. */
export function projectUsageText(cli = { options: {} }) {
  return usageText({
    analyzers: projectAnalyzers(cli),
    referenceUrl: docsUrl(USAGE_PAGE),
  });
}

export function printedInformation(options, cli) {
  if (options.help) {
    cli.stdout.write(projectUsageText({ ...cli, options }));
    return true;
  }
  if (options.version) {
    cli.stdout.write(`${packageVersion()}\n`);
    return true;
  }
  return false;
}
