import { findAffixChecks } from './affix-calls.mjs';

export const AFFIX_BOUNDARY_RULE = 'AffixWithoutBoundary';
export const AFFIX_BOUNDARY_EXCEPTION_RULE = `pmd/${AFFIX_BOUNDARY_RULE}`;

const FORMS = {
  java: {
    prefix: 'x.equals(base) || x.startsWith(base + "/")',
    host: 'host.equals(domain) || host.endsWith("." + domain)',
  },
  kotlin: {
    prefix: 'x == base || x.startsWith("$base/")',
    host: 'host == domain || host.endsWith(".$domain")',
  },
};

function messageFor(kind, kotlin) {
  const form = FORMS[kotlin ? 'kotlin' : 'java'];
  const messages = {
    prefix:
      'A text prefix check also accepts siblings that only share the text ' +
      `(\`/foo\` matches \`/foobar\`). Compare whole segments: \`${form.prefix}\`, or use \`Path.startsWith\`.`,
    suffix:
      'A host suffix check also accepts `evilexample.com` for `example.com`. ' +
      `Compare \`${form.host}\`.`,
    origin:
      'A URL prefix without a boundary also accepts `http://localhost.attacker.example`. ' +
      'Parse the value and compare `URI.getHost()` or the origin for equality.',
  };
  return messages[kind];
}

export const affixBoundaryRule = {
  id: AFFIX_BOUNDARY_RULE,
  find: findAffixChecks,
  message: ({ kind }, kotlin) => messageFor(kind, kotlin),
};

export const AFFIX_BOUNDARY_ALLOWED = messageFor('prefix', false);
