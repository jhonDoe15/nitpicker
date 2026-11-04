export function markedLine(marker, payload) {
  return `\n${marker}${JSON.stringify(payload)}\n`;
}

export function markedPayload(output, marker) {
  const line = output.split('\n').findLast((candidate) => candidate.startsWith(marker));
  return line === undefined ? undefined : JSON.parse(line.slice(marker.length));
}
