import { EXCEPTION_ROUTE } from '../../eslint-plugin/test-assertions/weak-assertion/found-text.mjs';

const DEFINED = `\`toBeDefined\` passes for any value but undefined. Assert the value itself with \`toBe\` or \`toEqual\`. ${EXCEPTION_ROUTE}`;
const NOT_UNDEFINED = `\`not.toBeUndefined\` passes for any value but undefined. Assert the value itself with \`toBe\` or \`toEqual\`. ${EXCEPTION_ROUTE}`;
const NOT_NULL = `\`not.toBeNull\` passes for any value but null. Assert the value itself with \`toBe\` or \`toEqual\`. ${EXCEPTION_ROUTE}`;
const TRUTHY = `\`toBeTruthy\` passes for any truthy value. Assert the exact value with \`toBe\` or \`toEqual\`. ${EXCEPTION_ROUTE}`;
const FALSY = `\`toBeFalsy\` passes for any falsy value. Assert the exact value with \`toBe\` or \`toEqual\`. ${EXCEPTION_ROUTE}`;

const BASE = [
  ['toBeDefined', DEFINED],
  ['not.toBeUndefined', NOT_UNDEFINED],
  ['not.toBeNull', NOT_NULL],
  ['toBeTruthy', TRUTHY],
  ['toBeFalsy', FALSY],
];

export const restrictedMatchers = Object.fromEntries(
  BASE.flatMap(([matcher, message]) => [
    [matcher, message],
    [`resolves.${matcher}`, message],
    [`rejects.${matcher}`, message],
  ]),
);
