const LISTED_FILES = 3;
const SINGULAR = { files: 'file is', them: 'it', their: 'its folder', list: 'it' };
const PLURAL = { files: 'files are', them: 'them', their: 'their folders', list: 'them' };

type Words = {
  readonly files: string;
  readonly them: string;
  readonly their: string;
  readonly list: string;
};

function filled(template: string, words: Words): string {
  return template
    .replaceAll('{them}', () => words.them)
    .replaceAll('{their}', () => words.their)
    .replaceAll('{list}', () => words.list);
}

export function outsideRootsNotice({
  files,
  kind,
  where,
  effect,
  destination,
}: {
  readonly files: Iterable<string>;
  readonly kind: string;
  readonly where: string;
  readonly effect: string;
  readonly destination: string;
}): string[] {
  const outside = [...files].sort();
  if (outside.length === 0) {
    return [];
  }
  const listed = outside.slice(0, LISTED_FILES).join(', ');
  const more =
    outside.length > LISTED_FILES ? `, and ${String(outside.length - LISTED_FILES)} more` : '';
  const words = outside.length === 1 ? SINGULAR : PLURAL;
  return [
    `${String(outside.length)} changed ${kind} ${words.files} outside ${where}, ${filled(effect, words)}: ${listed}${more}. ` +
      `Move ${words.them} ${filled(destination, words)}; to leave ${words.them} unchecked, list ${words.list} in "exclude" in nitpicker.config.json.`,
  ];
}
