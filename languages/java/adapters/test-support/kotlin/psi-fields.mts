import { fieldOf, listOf } from '../../../../../shared/values/readers.mts';

export function listAt(value: unknown, key: string): readonly unknown[] {
  return listOf(fieldOf(value, key));
}

export function column(items: readonly unknown[], key: string): unknown[] {
  return items.map((item) => fieldOf(item, key));
}

export function columns(items: readonly unknown[], ...keys: readonly string[]): unknown[][] {
  return items.map((item) => keys.map((key) => fieldOf(item, key)));
}
