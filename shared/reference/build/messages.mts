import { fieldOf } from '../../values/readers.mts';

const ROUTE =
  /\s*If this is intended, add (\{.*\}) to "((?:python\.)?exceptions)" in nitpicker\.config\.json\.$/su;

function parsedRoute(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('The exception route of a finding message is not valid JSON', { cause: error });
  }
}

function splitRoute(message: string): {
  text: string;
  route: Readonly<Record<string, unknown>> | undefined;
} {
  const match = ROUTE.exec(message);
  if (match === null) {
    return { text: message, route: undefined };
  }
  const parsed = parsedRoute(match[1] ?? '');
  const rule = fieldOf(parsed, 'rule');
  const packages = fieldOf(parsed, 'packages');
  const functionName = fieldOf(parsed, 'function');
  const name = fieldOf(parsed, 'name');
  return {
    text: message.slice(0, match.index).trim(),
    route: {
      key: match[2],
      rule,
      ...(packages === undefined ? {} : { packages: true }),
      ...(functionName === undefined ? {} : { function: true }),
      ...(name === undefined ? {} : { name: true }),
    },
  };
}

export function adviceOf(message: string): string {
  return splitRoute(message).text;
}
