const ROUTE =
  /\s*If this is intended, add (\{.*\}) to "((?:python\.)?exceptions)" in nitpicker\.config\.json\.$/su;

/**
 * A finding message split into its text and the exception entry its last sentence names, as the
 * `exception` of an entry: the config list, the rule and the narrowing keys it uses.
 */
function splitRoute(message) {
  const match = ROUTE.exec(message);
  if (match === null) {
    return { text: message, route: undefined };
  }
  const { rule, packages, function: functionName, name } = JSON.parse(match[1]);
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

/** The text of a finding message without its exception sentence. */
export function adviceOf(message) {
  return splitRoute(message).text;
}
