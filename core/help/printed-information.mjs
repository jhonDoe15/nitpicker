import { packageVersion } from './package-version.mjs';
import { USAGE_TEXT } from './usage-text.mjs';

export function printedInformation(options, stdout) {
  if (options.help) {
    stdout.write(USAGE_TEXT);
    return true;
  }
  if (options.version) {
    stdout.write(`${packageVersion()}\n`);
    return true;
  }
  return false;
}
