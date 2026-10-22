import { callsIn } from '../../syntax/kotlin-calls.mjs';
import { chainOf } from '../../syntax/expressions/kotlin-chains.mjs';
import { contextAt } from '../../syntax/expressions/kotlin-scope.mjs';
import { plainText } from '../../syntax/expressions/kotlin-strings.mjs';
import { descendants, identifierOf, kid, kids, textOf } from '../../syntax/kotlin-tree.mjs';
import { defineRule, hitOn, symbolAtNode } from '../rule-support.mjs';

const USER_BUILDERS = new Set(['withUsername', 'withUser', 'withDefaultPasswordEncoder']);

function isUserChain(file, call) {
  return (
    call.receiver !== undefined &&
    callsIn(file.source, call.receiver).some((inner) => USER_BUILDERS.has(inner.name))
  );
}

function literalLocals(file, ancestors, context) {
  const scopes = [context.scope.fn?.node, context.scope.owner?.node].filter(
    (node) => node !== undefined,
  );
  return new Set(
    scopes.flatMap((scope) =>
      descendants(scope, (node) => node.t === 'PROPERTY')
        .filter((node) => {
          const children = kids(node);
          const initializer = children[children.findIndex((child) => child.t === 'EQ') + 1];
          return plainText(file.source, initializer) !== undefined;
        })
        .map((node) => identifierOf(file.source, node)),
    ),
  );
}

function isLiteralPassword(file, call, locals) {
  const [argument] = call.arguments.map((node) => kids(node)[0]);
  if (argument === undefined) {
    return false;
  }
  if (plainText(file.source, argument) !== undefined) {
    return true;
  }
  if (argument.t === 'REFERENCE_EXPRESSION') {
    return locals.has(textOf(file.source, argument));
  }
  const encoded = callsIn(file.source, argument).find((inner) => inner.name === 'encode');
  return (
    encoded !== undefined &&
    kid(encoded.node, 'VALUE_ARGUMENT_LIST') !== undefined &&
    encoded.arguments.some((node) => plainText(file.source, kids(node)[0]) !== undefined)
  );
}

const hardcodedUser = defineRule(
  'SpringHardcodedUser',
  'Load users from a UserDetailsService backed by the database, with passwords hashed by the delegating encoder. Do not put a user password in source code.',
  (file) =>
    callsIn(file.source, file.tree)
      .filter((call) => call.name === 'password' && !call.reference && isUserChain(file, call))
      .filter((call) =>
        isLiteralPassword(
          file,
          call,
          literalLocals(file, call.ancestors, contextAt(file, call.ancestors)),
        ),
      )
      .map((call) => hitOn(chainOf(call).start, `${symbolAtNode(file, call.ancestors)}@password`)),
);

export const HARDCODED_USER_RULES = [hardcodedUser];
