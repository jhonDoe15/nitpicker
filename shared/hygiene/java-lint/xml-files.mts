import path from 'node:path';
import { readBoundedText } from '../../filesystem.mts';

export type XmlFile = { readonly file: string; readonly text: string };

const MAX_XML_BYTES = 2 * 1024 * 1024;
const XML_COMMENT = /<!--[\s\S]*?-->/gu;
const ATTRIBUTE = /([\w:-]+)\s*=\s*"([^"]*)"/gu;

export function withoutXmlComments(text: string): string {
  return text.replaceAll(XML_COMMENT, ' ');
}

type XmlTexts = { readonly projectRoot: string; readonly texts: ReadonlyMap<string, string> };

const readCache = new WeakMap<readonly string[], XmlTexts>();

function xmlTexts(projectRoot: string, files: readonly string[]): ReadonlyMap<string, string> {
  const cached = readCache.get(files);
  if (cached?.projectRoot === projectRoot) {
    return cached.texts;
  }
  const texts = new Map<string, string>();
  for (const file of files) {
    if (path.posix.extname(file).toLowerCase() === '.xml') {
      const raw = readBoundedText(projectRoot, file, MAX_XML_BYTES);
      texts.set(file, raw === undefined ? '' : withoutXmlComments(raw));
    }
  }
  readCache.set(files, { projectRoot, texts });
  return texts;
}

export function xmlFilesMatching(
  projectRoot: string,
  files: readonly string[],
  marker: RegExp,
): XmlFile[] {
  return [...xmlTexts(projectRoot, files)].flatMap(([file, text]) =>
    marker.test(text) ? [{ file, text }] : [],
  );
}

export function attributesOf(tagText: string): Map<string, string> {
  return new Map([...tagText.matchAll(ATTRIBUTE)].map((match) => [match[1] ?? '', match[2] ?? '']));
}

export function propertyValues(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const match of text.matchAll(/<property\b([^>]*?)\/?>/gu)) {
    const attributes = attributesOf(match[1] ?? '');
    const name = attributes.get('name');
    if (name !== undefined && !values.has(name)) {
      values.set(name, attributes.get('value') ?? '');
    }
  }
  return values;
}
