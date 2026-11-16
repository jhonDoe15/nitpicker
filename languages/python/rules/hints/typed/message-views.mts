import { renderMessage as untypedRender } from '../../../../../shared/messages/messages.mjs';
import {
  unitAllowedForm as untypedUnitAllowed,
  unitDescription as untypedUnitDescription,
} from '../../../../../shared/naming/time-units/unit-messages.mjs';
import type { HintData } from '../hint-types.mts';

type Values = Readonly<Record<string, string | number | undefined>>;

export const renderMessage: (template: string, values: Values) => string = untypedRender;
export const unitDescription: (kind: string, values: Values) => string = untypedUnitDescription;
export const unitAllowedForm: (kind: string, values: Values) => string = untypedUnitAllowed;

export function hintText(data: HintData, key: string): string {
  return String(data[key] ?? '');
}
