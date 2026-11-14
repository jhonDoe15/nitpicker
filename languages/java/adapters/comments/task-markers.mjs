const NOT_ISSUE_KEYS = 'SHA|UTF|ISO|RFC|MD|AES|RSA|TLS|SSL|HTTP|ES|ECMA|IEEE|CVE';
const REFERENCE = String.raw`#\d|(?!(?:${NOT_ISSUE_KEYS})-)[A-Z][A-Z0-9]+-\d|https?://\S`;

const MARKER_WORD = String.raw`(?<![\w./-])(?:TODO|FIXME|XXX|HACK|STOPSHIP)(?![\w-])`;

export const TASK_MARKER_PATTERN =
  String.raw`(?:^[\s*]*(?:TODO|FIXME|XXX|HACK|STOPSHIP)(?![\w-])(?![./]\w)|` +
  String.raw`(?<![\w./-])(?:TODO|FIXME|XXX|HACK|STOPSHIP)(?=[:(]))` +
  String.raw`(?!(?:(?!${MARKER_WORD})[^\n])+?(?<![\w-])(?:${REFERENCE}))`;

export const TASK_MARKER_MESSAGE =
  'A TODO or FIXME needs an issue reference: write `TODO(#123): ...` or `TODO PROJ-123: ...`, or do the work now.';

const TASK_MARKER = new RegExp(TASK_MARKER_PATTERN);

export function unreferencedMarker(lineText) {
  return TASK_MARKER.test(lineText);
}
