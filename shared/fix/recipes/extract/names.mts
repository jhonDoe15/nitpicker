import type { Reported } from './typed/extract-types.mts';

const NON_NAME = /[^\p{L}\p{N}_$]+/gu;
const FALLBACK_STEM = 'value';

function capitalized(text: string): string {
  return text === '' ? '' : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function lastSegment(label: string): string {
  const cleaned = label.replace(/\(.*$/u, '').replace(/#\d+$/u, '');
  return cleaned.slice(cleaned.lastIndexOf('.') + 1);
}

export function helperNameFor(label: string, taken: ReadonlySet<string>): string | undefined {
  const stem = lastSegment(label).replaceAll(NON_NAME, '');
  const name = /^[\p{L}_$]/u.test(stem) ? `shared${capitalized(stem)}` : 'sharedBody';
  return taken.has(name) ? undefined : name;
}

function freshName(stem: string | undefined, taken: ReadonlySet<string>): string | undefined {
  const base =
    typeof stem === 'string' && /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(stem) ? stem : FALLBACK_STEM;
  const candidates = [
    base,
    `${base}Value`,
    ...Array.from({ length: 98 }, (_, i) => `${base}Value${String(i + 2)}`),
  ];
  return candidates.find((name) => !taken.has(name));
}

export function declineNote({ path, line }: Reported, reason: string): string {
  return `--fix left ${path}:${String(line)} near-duplicate: ${reason}`;
}

export function nameHoles<Hole extends object>(
  holes: readonly Hole[],
  taken: Iterable<string>,
  stemOf: (hole: Hole) => string | undefined,
): (Hole & { name: string })[] | undefined {
  const names = new Set(taken);
  const named: (Hole & { name: string })[] = [];
  for (const hole of holes) {
    const name = freshName(stemOf(hole), names);
    if (name === undefined) {
      return undefined;
    }
    names.add(name);
    named.push({ ...hole, name });
  }
  return named;
}

export const TYPE_PARAMETER_NAMES: readonly string[] = Object.freeze([
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  ...Array.from({ length: 20 }, (_, index) => `T${String(index + 1)}`),
]);
