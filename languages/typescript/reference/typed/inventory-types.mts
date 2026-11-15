import { fieldOf, fieldsOf, listOf, textOf, textsOf } from '../../../../shared/values/readers.mts';

export type RuleForm = { readonly label?: string; readonly message: string };

export type RuleFacts = {
  readonly tools: readonly string[];
  readonly forms: readonly RuleForm[];
  readonly description?: string;
  readonly url?: string;
  readonly messages?: readonly string[];
  readonly deprecated?: true;
  readonly fixable?: true;
};

export type VariantInventory = Readonly<Record<string, RuleFacts>>;

export type EslintInventory = Readonly<Record<string, VariantInventory>>;

function formOf(value: unknown): RuleForm {
  const label = fieldOf(value, 'label');
  return {
    message: textOf(fieldOf(value, 'message')),
    ...(typeof label === 'string' ? { label } : {}),
  };
}

function factsOf(value: unknown): RuleFacts {
  const description = fieldOf(value, 'description');
  const url = fieldOf(value, 'url');
  const messages = fieldOf(value, 'messages');
  return {
    tools: textsOf(fieldOf(value, 'tools')),
    forms: listOf(fieldOf(value, 'forms')).map(formOf),
    ...(typeof description === 'string' ? { description } : {}),
    ...(typeof url === 'string' ? { url } : {}),
    ...(messages === undefined ? {} : { messages: textsOf(messages) }),
    ...(fieldOf(value, 'deprecated') === true ? { deprecated: true } : {}),
    ...(fieldOf(value, 'fixable') === true ? { fixable: true } : {}),
  };
}

function recordOf<T>(value: unknown, read: (entry: unknown) => T): Readonly<Record<string, T>> {
  return Object.fromEntries(
    Object.entries(fieldsOf(value)).map(([key, entry]) => [key, read(entry)]),
  );
}

export function variantInventoryOf(value: unknown): VariantInventory {
  return recordOf(value, factsOf);
}

export function inventoryOf(value: unknown): EslintInventory {
  return recordOf(value, variantInventoryOf);
}
