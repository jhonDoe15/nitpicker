const COMMENT = String.raw`[ \t]*(?:#.*)?`;
const NAMED_GROUP = /\(\?P</gu;
const GROUP_REFERENCE = /\(\?P=(\w+)\)/gu;

export const ASSERT_NEVER_ARM = [
  String.raw`^(?P<case>[ \t]*)case[ \t]+_[ \t]*:${COMMENT}\n`,
  String.raw`(?P=case)(?P<arm>[ \t]+)(?:typing\.|typing_extensions\.)?assert_never\([ \t]*\w+[ \t]*\)${COMMENT}$`,
  String.raw`(?!(?:\n${COMMENT}$)*\n(?P=case)(?P=arm)[^ \t\r\n#])`,
].join('');

export function javascriptPattern(pythonPattern, flags = 'gmu') {
  return new RegExp(
    pythonPattern.replaceAll(NAMED_GROUP, '(?<').replaceAll(GROUP_REFERENCE, String.raw`\k<$1>`),
    flags,
  );
}

export function assertNeverArmLines(source) {
  return [...source.matchAll(javascriptPattern(ASSERT_NEVER_ARM))].map((match) => {
    const first = source.slice(0, match.index).split('\n').length - 1;
    return { first, last: first + match[0].split('\n').length - 1 };
  });
}
