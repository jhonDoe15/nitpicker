const ESCAPE_CHARACTER = String.fromCodePoint(0x1b);

const ESCAPE_FORMS = [ESCAPE_CHARACTER, String.raw`\?`, '&(?:amp;)?#(?:27|[xX]1[bB]);'];

const ANSI_PATTERN = new RegExp(`(?:${ESCAPE_FORMS.join('|')})\\[[0-9;]*m`, 'gu');

export function stripAnsi(text) {
  return text.replaceAll(ANSI_PATTERN, '');
}
