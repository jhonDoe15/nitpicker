import { readFileSync } from 'node:fs';
import {
  blankComments,
  blankLiterals,
  sourceFilesUnder,
} from '../../review-rules/java-sources.mjs';
import { valueOr } from '../spring-config-files.mjs';
import { closingIndex, stringLiterals } from './classes/source-structure.mjs';

const SOURCE_EXTENSIONS = ['.java', '.kt'];
const RESOURCE_EXTENSIONS = ['.properties', '.yml', '.yaml', '.xml', '.json', '.conf', '.sql'];
const PLACEHOLDER = /\$\{([^}:]+)/gu;
const LOGGING_SOURCE = /\bsource\s*=\s*"([^"]+)"/gu;
const READ_CALL =
  /\b(?:getProperty|getRequiredProperty|containsProperty)(?:<[^>]*>)?\s*\(\s*"([^"]+)"\s*([,)+])/gu;
const BIND_CALL = /\.\s*bind(?:<[^>]*>)?\s*\(\s*"([^"]+)"/gu;
const CONDITION = /@(?:[\w.]*\.)?ConditionalOn\w*Property\s*\(/gu;
const ENDPOINT =
  /@(?:[\w.]*\.)?(?:\w*Endpoint|ConditionalOnEnabled\w+)\s*\(\s*(?:id\s*=\s*|value\s*=\s*)?"([^"]+)"/gu;

export function readSource(file) {
  const raw = valueOr('', () => readFileSync(file, 'utf8'));
  const text = blankComments(raw);
  return { file, text, code: blankLiterals(raw), kotlin: file.endsWith('.kt') };
}

export function sourcesUnder(projectRoot, roots) {
  const files = [...new Set(roots)].flatMap((root) =>
    sourceFilesUnder(`${projectRoot}/${root}`, SOURCE_EXTENSIONS),
  );
  return [...new Set(files)].map(readSource);
}

function attributeStrings(argumentsText, name) {
  const attribute = new RegExp(String.raw`\b${name}\s*=\s*`, 'u').exec(argumentsText);
  if (attribute === null) {
    return [];
  }
  const rest = argumentsText.slice(attribute.index + attribute[0].length);
  const value = /^[[{]/u.test(rest) ? rest.slice(0, closingIndex(rest, 0) + 1) : rest.split(',')[0];
  return stringLiterals(value).map(({ value: literal }) => literal);
}

function conditionKeys(text, code) {
  return [...code.matchAll(CONDITION)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const argumentsText = text.slice(open + 1, closingIndex(code, open));
    const prefix = attributeStrings(argumentsText, 'prefix')[0];
    const named = [
      ...attributeStrings(argumentsText, 'name'),
      ...attributeStrings(argumentsText, 'value'),
    ];
    const names =
      named.length > 0 ? named : [/^\s*"([^"]*)"/u.exec(argumentsText)?.[1]].filter(Boolean);
    return names.map((name) =>
      prefix === undefined ? name : `${prefix.replace(/\.$/u, '')}.${name}`,
    );
  });
}

function endpointKeys(text) {
  return [...text.matchAll(ENDPOINT)].flatMap(([, id]) => [
    `management.endpoint.${id}`,
    `management.health.${id}`,
  ]);
}

function sourceKeys({ text, code }) {
  const reads = [...text.matchAll(READ_CALL)];
  return {
    exact: [
      ...[...text.matchAll(PLACEHOLDER)].map(([, key]) => key),
      ...reads.filter(([, , next]) => next !== '+').map(([, key]) => key),
      ...conditionKeys(text, code),
    ],
    open: [
      ...reads.filter(([, , next]) => next === '+').map(([, key]) => key),
      ...[...text.matchAll(BIND_CALL)].map(([, key]) => key),
      ...endpointKeys(text),
    ],
  };
}

function resourceKeys(file) {
  const text = valueOr('', () => readFileSync(file, 'utf8'));
  return [...text.matchAll(PLACEHOLDER), ...text.matchAll(LOGGING_SOURCE)].map(([, key]) => key);
}

function relaxedKeys(keys) {
  return keys
    .map((key) => key.trim())
    .filter((key) => /^[\w.[\]-]+$/u.test(key))
    .map((key) => key.replace(/\.+$/u, ''));
}

export function referencedKeys({ projectRoot, sources, resourceRoots }) {
  const found = sources.map(sourceKeys);
  const resources = resourceRoots.flatMap((root) =>
    sourceFilesUnder(`${projectRoot}/${root}`, RESOURCE_EXTENSIONS),
  );
  return {
    exact: relaxedKeys([
      ...found.flatMap(({ exact }) => exact),
      ...[...new Set(resources)].flatMap(resourceKeys),
    ]),
    open: relaxedKeys(found.flatMap(({ open }) => open)),
  };
}
