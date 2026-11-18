import { exceptionRoute as exceptionRouteUntyped } from '../../../../../../shared/exceptions/rule-names.mjs';
import { appendSentence as appendSentenceUntyped } from '../../../../../../shared/messages/exception-sentence.mjs';

type Route = {
  readonly rule: string;
  readonly path: string | undefined;
  readonly function?: string | undefined;
  readonly name?: string | undefined;
  readonly key?: string | undefined;
};

const routeOf: (route: {
  rule: string;
  path: string | undefined;
  function: string | undefined;
  name: string | undefined;
  key: string | undefined;
}) => string | undefined = exceptionRouteUntyped;

export function exceptionRoute(route: Route): string | undefined {
  return routeOf({ function: undefined, name: undefined, key: undefined, ...route });
}

export const appendSentence: (message: string, sentence: string | undefined) => string =
  appendSentenceUntyped;
