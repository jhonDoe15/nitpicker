import { bindingsOf } from '../repositories/declared-names.mts';

const STRING = 'String';

type Kind = typeof STRING | 'CharSequence';

const PRESERVING_CALL =
  /\s*\.\s*(?:trim|trimStart|trimEnd|lowercase|uppercase|toString)\s*\(\s*\)$/u;
const NAME_END = /(?<![\w.])([A-Za-z_]\w*)$/u;
const STRING_TYPES = new Set([STRING, 'kotlin.String']);
const STRING_INITIALIZER = /^"/u;

function bindingKind(binding: ReturnType<typeof bindingsOf>[number]): Kind | undefined {
  if (binding.kind === 'typed') {
    if (STRING_TYPES.has(binding.type)) {
      return STRING;
    }
    return binding.type === 'CharSequence' ? 'CharSequence' : undefined;
  }
  return binding.kind === 'inferred' && STRING_INITIALIZER.test(binding.initializer)
    ? STRING
    : undefined;
}

function nameKind(code: string, name: string): Kind | undefined {
  const kinds = new Set(bindingsOf(code, name).map(bindingKind));
  const [only] = kinds;
  return kinds.size === 1 ? only : undefined;
}

function stripped(text: string): string {
  const pending = [text];
  for (const current of pending) {
    const rest = current.replace(PRESERVING_CALL, '');
    if (rest === current) {
      return current;
    }
    pending.push(rest);
  }
  return text;
}

export function receiverKind(code: string, dotIndex: number): Kind | undefined {
  const before = stripped(code.slice(0, dotIndex).trimEnd().replace(/\?$/u, '').trimEnd());
  if (before.endsWith('"')) {
    return STRING;
  }
  const name = NAME_END.exec(before);
  return name === null ? undefined : nameKind(code, name[1] ?? '');
}
