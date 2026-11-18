import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

const PIPE = '|';

function parts(subject = ''): string[] {
  const at = subject.indexOf(PIPE);
  return at < 0 ? [subject, ''] : [subject.slice(0, at), subject.slice(at + 1)];
}

function affixDescription(subject?: string): string {
  const [kind = '', call = ''] = parts(subject);
  if (kind === 'suffix') {
    return `\`${call}\` checks a host suffix without a dot boundary, so \`evilexample.com\` matches \`example.com\``;
  }
  if (kind === 'origin') {
    return `\`${call}\` checks a bare origin, so \`http://localhost.attacker.example\` also matches`;
  }
  if (kind === 'segment') {
    return `\`${call}\` matches a directory name anywhere in the text, including \`my-node_modules-cache/\``;
  }
  return (
    `\`${call}\` is a text prefix check on a path, route or ` +
    `package name, so a sibling that only shares the text ` +
    `(\`/foo\` and \`/foobar\`) also matches`
  );
}


function replaceDescription(subject?: string): string {
  const [kind = '', call = ''] = parts(subject);
  return kind === 'suffix'
    ? `\`${call}\` removes a suffix with a plain replace, which ` +
        `rewrites the first occurrence anywhere (\`blog.github.io\` ` +
        `loses its \`.git\`)`
    : `\`${call}\` removes a prefix or URL part with a plain ` +
        `replace, which rewrites the first occurrence anywhere, not ` +
        `the leading part`;
}


export const MINED_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['prefix-without-boundary'],
    describe: affixDescription,
    allowed:
      'Compare whole segments: `x == base or x.startswith(base + ' +
      '"/")`, `host == domain or host.endswith("." + domain)`, ' +
      '`Path.is_relative_to`, or parse the URL and compare ' +
      '`urlsplit(x).hostname`. An exception fits when the prefix is ' +
      'meant as plain text.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unanchored-affix-replace'],
    describe: replaceDescription,
    allowed:
      'Use `name.removesuffix(".git")` or `path.removeprefix(root)`, ' +
      'or set the field on the parsed URL ' +
      '(`parsed._replace(netloc=...)`).',
  },
];
