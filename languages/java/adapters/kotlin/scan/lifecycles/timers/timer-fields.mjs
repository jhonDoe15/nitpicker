import { closeHandles, scopesOf } from '../scopes/class-scopes.mjs';

const RULE = 'TimerNotStoppedOnClose';
const ANNOTATION_LOOKBEHIND = 200;
const MESSAGES = {
  [RULE]:
    'This scheduler or timer is created by a class that has a close function, but close never shuts it down, so its scheduled tasks keep running and its thread keeps the JVM alive after close. Call `shutdown()` (then `awaitTermination`) on the executor, or `cancel()` on the Timer, in close. An exception fits only when the scheduler is shared and owned elsewhere.',
};
const TIMER_CREATION =
  /=\s*(?:Executors\s*\.\s*new\w*Scheduled\w*\s*\(|(?:java\.util\.)?Timer\s*\(|fixedRateTimer\s*\(|timer\s*\()/;
const RELEASING = /\b(?:shutdown\w*|close|cancel|purge|awaitTermination)\b/;
const MANAGED = /@(?:Component|Service|Repository|Configuration|Controller|RestController)\b/;

const LATE_TIMER = /\bvar\b[^\n]*:\s*(?:java\.util\.)?(?:ScheduledExecutorService|Timer)\b/;

function createsTimer(code, scope, property) {
  if (TIMER_CREATION.test(property.text)) {
    return true;
  }
  if (!LATE_TIMER.test(property.text)) {
    return false;
  }
  const body = code.slice(scope.body.open, scope.body.end);
  return new RegExp(String.raw`\b${property.name}\s*${TIMER_CREATION.source}`).test(body);
}

function managedBean(code, scope) {
  const before = code.slice(Math.max(0, scope.offset - ANNOTATION_LOOKBEHIND), scope.offset);
  return MANAGED.test(before.slice(before.lastIndexOf('\n\n') + 1));
}

export function timerNotStoppedOnClose(scanned) {
  const { code } = scanned;
  return scopesOf(code)
    .filter((scope) => scope.closers.length > 0 && !managedBean(code, scope.body))
    .flatMap((scope) =>
      scope.properties
        .filter(
          (property) =>
            createsTimer(code, scope, property) && !closeHandles(scope, property.name, RELEASING),
        )
        .map((property) => ({ rule: RULE, offset: property.offset })),
    );
}

export const kotlinSourceRules = { messages: MESSAGES, main: [timerNotStoppedOnClose] };
