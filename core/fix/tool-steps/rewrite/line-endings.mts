import type { Formatter } from '../../typed/command-types.mts';

export function withLineEndingsOf(source: string, formatted: string): string {
  return source.includes('\r\n') && !formatted.includes('\r')
    ? formatted.replaceAll('\n', '\r\n')
    : formatted;
}

export function keepingLineEndings(format: Formatter): Formatter {
  return (sources) => {
    const outcome = format(sources);
    return {
      ...outcome,
      formatted: new Map(
        [...outcome.formatted].map(([name, text]): [string, string] => [
          name,
          withLineEndingsOf(sources.get(name) ?? '', text),
        ]),
      ),
    };
  };
}

const LONE_LINE_FEED = /(?<!\r)\n/gu;

export function withFixedLineEndingsOf(source: string, fixed: string): string {
  return source.includes('\r\n') && source.match(LONE_LINE_FEED) === null
    ? fixed.replaceAll(LONE_LINE_FEED, '\r\n')
    : fixed;
}
