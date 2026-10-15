const FLAGS_WITH_VALUE = new Set([
  '--import',
  '--require',
  '-r',
  '--loader',
  '--experimental-loader',
  '--conditions',
  '-C',
  '--env-file',
]);
const RUNNER_OWN_FLAG = /^--(?:test|experimental-test-coverage|watch)/u;
const COMMAND_SEPARATOR = /&&|\|\||;|\|/u;
const NODE_TEST_SEGMENT = /(?<![\w-])(node|tsx)\b(.*\s--test(?=\s|$).*)/u;

function flagsOf(tokens) {
  const flags = [];
  for (let index = 0; index < tokens.length && tokens[index].startsWith('-'); index += 1) {
    const token = tokens[index];
    if (RUNNER_OWN_FLAG.test(token)) continue;
    flags.push(token);
    if (FLAGS_WITH_VALUE.has(token)) {
      flags.push(tokens[index + 1]);
      index += 1;
    }
  }
  return flags;
}

function segmentArguments(segment) {
  const match = NODE_TEST_SEGMENT.exec(segment);
  if (match === null) return undefined;
  const flags = flagsOf(match[2].trim().split(/\s+/u).filter(Boolean));
  return match[1] === 'tsx' ? ['--import', 'tsx', ...flags] : flags;
}

export function nodeTestArguments(command) {
  return command
    .split(COMMAND_SEPARATOR)
    .map(segmentArguments)
    .find((flags) => flags !== undefined);
}

export function nodeTestArgumentsOf(scripts) {
  return (
    scripts.map(([, command]) => nodeTestArguments(command)).find((flags) => flags !== undefined) ??
    []
  );
}
