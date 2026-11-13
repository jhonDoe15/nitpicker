import { closeHandles, scopesOf } from '../scopes/class-scopes.mjs';

const RULE = 'PendingFuturesNotFailedOnClose';
const MESSAGES = {
  [RULE]:
    'This map keeps a pending request per id as a CompletableDeferred or future, but the close function of its class never completes them, so every caller still waiting hangs forever. In close, complete every entry exceptionally (`pending.values.forEach { it.completeExceptionally(IllegalStateException("closed")) }`) and then clear the map. An exception fits only when the entries are completed elsewhere before the class closes.',
};
const FUTURE_TYPE =
  /\b(?:CompletableDeferred|CompletableFuture|Deferred|Future|SettableFuture|CancellableContinuation)\b/;
const MAP_TYPE = /\w*Map(?:Of)?\b/;
const SETTLING = new RegExp(
  String.raw`\b(?:completeExceptionally|cancel|complete|resumeWithException|obtrudeException)\b` +
    String.raw`|\b(?:fail|settle|reject|abort)\w*\s*\(|::\s*(?:fail|settle|reject|complete|cancel)`,
);

export function pendingFuturesNotFailedOnClose(scanned) {
  const { code } = scanned;
  return scopesOf(code)
    .filter((scope) => scope.closers.length > 0)
    .flatMap((scope) =>
      scope.properties
        .filter((property) => MAP_TYPE.test(property.text) && FUTURE_TYPE.test(property.text))
        .filter((property) => !closeHandles(scope, property.name, SETTLING))
        .map((property) => ({ rule: RULE, offset: property.offset })),
    );
}

export const kotlinSourceRules = { messages: MESSAGES, main: [pendingFuturesNotFailedOnClose] };
