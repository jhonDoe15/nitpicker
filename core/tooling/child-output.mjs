export const HOST_CI_OUTPUT_VARIABLES = ['GITHUB_STEP_SUMMARY'];

export function withoutHostCiOutput(environment) {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !HOST_CI_OUTPUT_VARIABLES.includes(name)),
  );
}

export function markedLine(marker, payload) {
  return `\n${marker}${JSON.stringify(payload)}\n`;
}

export function markedPayload(output, marker) {
  const line = output.split('\n').findLast((candidate) => candidate.startsWith(marker));
  return line === undefined ? undefined : JSON.parse(line.slice(marker.length));
}
