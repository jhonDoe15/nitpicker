const NON_NAME = /[^\p{L}\p{N}_$]+/gu;
const FALLBACK_STEM = 'value';

function capitalized(text) {
  return text === '' ? '' : `${text[0].toUpperCase()}${text.slice(1)}`;
}

export function lastSegment(label) {
  const cleaned = label.replace(/\(.*$/u, '').replace(/#\d+$/u, '');
  return cleaned.slice(cleaned.lastIndexOf('.') + 1);
}

export function helperNameFor(label, taken) {
  const stem = lastSegment(label).replaceAll(NON_NAME, '');
  const name = /^[\p{L}_$]/u.test(stem) ? `shared${capitalized(stem)}` : 'sharedBody';
  return taken.has(name) ? undefined : name;
}

export function freshName(stem, taken) {
  const base = /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(stem ?? '') ? stem : FALLBACK_STEM;
  const candidates = [
    base,
    `${base}Value`,
    ...Array.from({ length: 98 }, (_, i) => `${base}Value${i + 2}`),
  ];
  return candidates.find((name) => !taken.has(name));
}

export function declineNote({ path, line }, reason) {
  return `--fix left ${path}:${line} near-duplicate: ${reason}`;
}
