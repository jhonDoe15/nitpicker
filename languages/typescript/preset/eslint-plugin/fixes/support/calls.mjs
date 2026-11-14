import { hasCommentIn, inserting, replacing } from './ranges.mjs';

export function appendingArgument(sourceCode, call, text) {
  const last = call.arguments.at(-1);
  if (last !== undefined) {
    return inserting(last.range[1], `, ${text}`);
  }
  return inserting(sourceCode.getLastToken(call).range[0], text);
}

export function removingLastArgument(sourceCode, call, argument) {
  if (call.arguments.at(-1) !== argument) {
    return undefined;
  }
  const previous = call.arguments[call.arguments.indexOf(argument) - 1];
  const range = [previous === undefined ? argument.range[0] : previous.range[1], argument.range[1]];
  return hasCommentIn(sourceCode, range) ? undefined : replacing(range, '');
}
