import { eslintUnitMessage as untypedEslintUnitMessage } from '../../../../../../../shared/naming/time-units/unit-messages.mjs';
import {
  argumentUnitOfCallName as untypedArgumentUnitOfCallName,
  convertedUnit as untypedConvertedUnit,
  conversionExample as untypedConversionExample,
  isEpochName as untypedIsEpochName,
  unitFactor as untypedUnitFactor,
  unitLabel as untypedUnitLabel,
  unitOfCallName as untypedUnitOfCallName,
  unitOfName as untypedUnitOfName,
} from '../../../../../../../shared/naming/time-units/unit-names.mjs';

export type Unit = 'ns' | 'us' | 'ms' | 's' | 'min';
type MessageKind = 'mixed' | 'assigned' | 'argument' | 'narrowed';

export const unitOfName: (name: string) => Unit | undefined = untypedUnitOfName;

export const unitOfCallName: (name: string) => Unit | undefined = untypedUnitOfCallName;

export const argumentUnitOfCallName: (name: string) => Unit | undefined =
  untypedArgumentUnitOfCallName;

export const isEpochName: (name: string) => boolean = untypedIsEpochName;

const scaledUnit: (unit: Unit | undefined, factor: number, operator: string) => string | undefined =
  untypedConvertedUnit;

function isUnit(value: string | undefined): value is Unit {
  return value === 'ns' || value === 'us' || value === 'ms' || value === 's' || value === 'min';
}

export function convertedUnit(
  unit: Unit | undefined,
  factor: number,
  operator: string,
): Unit | undefined {
  const converted = scaledUnit(unit, factor, operator);
  return isUnit(converted) ? converted : undefined;
}

export const unitFactor: (left: Unit, right: Unit) => number = untypedUnitFactor;

export const conversionExample: (value: string, from: Unit, to: Unit) => string =
  untypedConversionExample;

export const unitLabel: (unit: Unit) => string = untypedUnitLabel;

export const eslintUnitMessage: (
  kind: MessageKind,
  values?: Readonly<Record<string, string>>,
) => string = untypedEslintUnitMessage;
