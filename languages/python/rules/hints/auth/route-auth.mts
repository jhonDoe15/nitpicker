import { RULES_TOOL } from '../tool.mts';
import { parseEffect } from '../effects/subject.mts';
import type { RuleHint } from '../hint-types.mts';

function details(subject: string) {
  const { path, fields } = parseEffect(subject);
  const [framework = 'the framework', shape = 'the auth requirement', share = 'most'] = fields;
  const [handler = '<handler>'] = path;
  return { handler, framework, shape, share };
}

function describe(subject: string): string {
  const { handler, framework, shape, share } = details(subject);
  return `\`${handler}\` is a ${framework} route handler without the auth requirement that ${share} of the project's handlers declare (\`${shape}\`): callers it was not meant for can reach it`;
}

function allowed(subject: string): string {
  const { shape } = details(subject);
  return `Declare the requirement the other handlers use (\`${shape}\`), at the handler, on its router or view base class. A route that is public on purpose (login, health, webhook) belongs in an exception with that reason.`;
}

export const ROUTE_AUTH_HINTS: readonly RuleHint[] = [
  { tool: RULES_TOOL, rules: ['route-without-auth'], describe, allowed },
];
