export const MINIMUM_LENGTH = 5;
export const MAXIMUM_USES = 2;

export const IDIOMATIC_TEXTS = [
  'utf-8',
  'utf8',
  'ascii',
  'latin-1',
  'utf-16',
  'store_true',
  'store_false',
  'store_const',
  'append',
  'append_const',
  'count',
  'version',
  'extend',
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];

export const MIME_TYPE_PATTERN = '^[a-z]+/[a-z0-9.+*-]+$';

export const TIME_FORMAT_PATTERN = '^(?:%[A-Za-z]|[-:/ T.,_])+$';

export const TRANSLATION_CALLS = [
  '_',
  '__',
  '_t',
  't',
  '$t',
  'translate',
  'formatMessage',
  'getMessage',
  'getString',
  'getTranslations',
  'getFixedT',
  'useTranslation',
  'useTranslations',
  'gettext',
  'ngettext',
  'pgettext',
  'lazy_gettext',
  'gettext_lazy',
  'gettext_noop',
];

export const DISCRIMINANT_KEYS = ['type', 'kind', 'tag', 'variant'];

const IDIOMS = new Set(IDIOMATIC_TEXTS);
const MIME_TYPE = new RegExp(MIME_TYPE_PATTERN);
const TIME_FORMAT = new RegExp(TIME_FORMAT_PATTERN);

export function isIdiomaticText(text) {
  return IDIOMS.has(text) || MIME_TYPE.test(text) || (text.includes('%') && TIME_FORMAT.test(text));
}
