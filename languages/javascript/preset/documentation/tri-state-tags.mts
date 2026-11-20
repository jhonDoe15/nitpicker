import type { JsdocTag } from './jsdoc-types.mts';

const TRI_STATE_FORMS = [
  String.raw`\?\s*boolean`,
  String.raw`boolean\s*\|\s*(?:undefined|null)`,
  String.raw`(?:undefined|null)\s*\|\s*boolean`,
  'boolean=',
];
const TRI_STATE_TYPE = new RegExp(
  String.raw`^(?:Promise<\s*)?(?:${TRI_STATE_FORMS.join('|')})\s*>?$`,
);
const BARE_NAME = /^\[[\w$]+\]$/;

export function isTriStateTag(tag: JsdocTag): boolean {
  if (tag.type === undefined) {
    return false;
  }
  const optionalParameter = tag.tag === 'param' && BARE_NAME.test(tag.name ?? '');
  return TRI_STATE_TYPE.test(tag.type) || (optionalParameter && tag.type === 'boolean');
}
