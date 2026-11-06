export function withLineEndingsOf(source, formatted) {
  return source.includes('\r\n') && !formatted.includes('\r')
    ? formatted.replaceAll('\n', '\r\n')
    : formatted;
}

export function keepingLineEndings(format) {
  return (sources) => {
    const outcome = format(sources);
    return {
      ...outcome,
      formatted: new Map(
        [...outcome.formatted].map(([name, text]) => [
          name,
          withLineEndingsOf(sources.get(name), text),
        ]),
      ),
    };
  };
}
