import { exceptionRoute as untypedRoute } from '../../../../shared/exceptions/rule-names.mts';
import { definedField as untypedDefinedField } from '../../../../shared/messages/messages.mts';

type RouteInput = {
  readonly rule: string;
  readonly path: string;
  readonly key: string;
  readonly function: string | undefined;
  readonly name: string | undefined;
};

export const exceptionRoute: (input: RouteInput) => string | undefined = untypedRoute;
export const definedField: (name: string, value: string | undefined) => Record<string, string> =
  untypedDefinedField;
