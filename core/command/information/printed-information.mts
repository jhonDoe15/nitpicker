import { docsUrl } from '../../../shared/messages/docs-url.mjs';
import { textOf } from '../../../shared/values/readers.mts';
import { packageVersion } from '../../help/package-version.mts';
import { type InformationCli, projectAnalyzers } from './project-analyzers.mts';
import { usageText } from '../../help/usage-text.mts';
import type { CliOptions, TextOutput } from '../../cli-context.mts';

const USAGE_PAGE = 'docs/usage.md';

export function projectUsageText(cli: InformationCli = { options: {} }): string {
  return usageText({
    analyzers: projectAnalyzers(cli),
    referenceUrl: docsUrl(USAGE_PAGE),
  });
}

export function printedInformation(
  options: CliOptions,
  cli: Omit<InformationCli, 'options'> & { readonly stdout: TextOutput },
): boolean {
  if (options.help) {
    cli.stdout.write(projectUsageText({ ...cli, options }));
    return true;
  }
  if (options.version) {
    cli.stdout.write(`${textOf(packageVersion())}\n`);
    return true;
  }
  return false;
}
