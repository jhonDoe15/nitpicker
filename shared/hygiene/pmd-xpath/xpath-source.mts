import { xmlFilesMatching } from '../java-lint/xml-files.mts';

export type XPathRule = { readonly file: string; readonly rule: string; readonly xpath: string };

const RULESET = /<ruleset[\s>]/u;
const RULE = /<rule\b([^>]*)>([\s\S]*?)<\/rule>/gu;
const XPATH_PROPERTY = /<property\s+name="xpath"[^>]*>\s*<value>([\s\S]*?)<\/value>/u;
const CDATA = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/u;
const RULE_NAME = /\bname="([^"]*)"/u;
const XPATH_COMMENT = /\(:[\s\S]*?:\)/gu;
const STRING_LITERAL = /'(?:[^']|'')*'|"(?:[^"]|"")*"/gu;
const ENTITIES: readonly (readonly [string, string])[] = [
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&apos;', "'"],
  ['&amp;', '&'],
];

function decoded(value: string): string {
  const cdata = CDATA.exec(value);
  return cdata === null
    ? ENTITIES.reduce((text, [entity, character]) => text.replaceAll(entity, character), value)
    : (cdata[1] ?? '');
}

export function plainXPath(xpath: string): string {
  return xpath.replaceAll(XPATH_COMMENT, ' ').replaceAll(STRING_LITERAL, "''");
}

export function projectXPathRules(projectRoot: string, files: readonly string[]): XPathRule[] {
  return xmlFilesMatching(projectRoot, files, RULESET).flatMap(({ file, text }) =>
    [...text.matchAll(RULE)].flatMap((match) => {
      const value = XPATH_PROPERTY.exec(match[2] ?? '')?.[1];
      const name = RULE_NAME.exec(match[1] ?? '')?.[1];
      return value === undefined || name === undefined
        ? []
        : [{ file, rule: name, xpath: plainXPath(decoded(value)) }];
    }),
  );
}
