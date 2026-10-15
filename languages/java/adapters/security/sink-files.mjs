export function queryOffsetFromTop(line) {
  const parameters = /\(([^)]*)\)/.exec(line)[1];
  return (parameters.match(/L[^;]+;/g) ?? []).length - 1;
}

export function sinkOffsetErrors(text) {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .filter((line) => Number(line.split(':').at(-1)) !== queryOffsetFromTop(line));
}
