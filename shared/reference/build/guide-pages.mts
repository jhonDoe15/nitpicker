import { existsSync, readdirSync, readFileSync } from 'node:fs';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url);
const NOT_SLUG = /[^\p{L}\p{N}\s_-]/gu;
const FENCE = /^\s*```/u;

export function headingAnchors(text: string): string[] {
  const anchors: string[] = [];
  let fenced = false;
  for (const line of text.split('\n')) {
    fenced = FENCE.test(line) ? !fenced : fenced;
    if (!fenced && /^#{1,6} /u.test(line)) {
      const base = line
        .replace(/^#+ /u, '')
        .replaceAll('`', '')
        .toLowerCase()
        .replaceAll(NOT_SLUG, '')
        .trim()
        .replaceAll(/\s/gu, '-');
      const repeats = anchors.filter((anchor) => anchor === base).length;
      anchors.push(repeats === 0 ? base : `${base}-${String(repeats)}`);
    }
  }
  return anchors;
}

export function guidePages(guide: string): string[] {
  const folder = new URL(guide.replace(/\.md$/u, '/'), REPOSITORY_ROOT);
  const pages = existsSync(folder)
    ? readdirSync(folder)
        .filter((name) => name.endsWith('.md'))
        .toSorted()
        .map((name) => `${guide.replace(/\.md$/u, '')}/${name}`)
    : [];
  return [guide, ...pages];
}

export function guideText(page: string): string {
  return readFileSync(new URL(page, REPOSITORY_ROOT), 'utf8');
}

export function guideLink(
  guide: string,
  anchor: string | undefined,
): { path: string; anchor?: string } {
  if (anchor === undefined) {
    return { path: guide };
  }
  const page = guidePages(guide).find((file) => headingAnchors(guideText(file)).includes(anchor));
  if (page === undefined || page === guide) {
    return { path: guide, anchor };
  }
  return headingAnchors(guideText(page))[0] === anchor ? { path: page } : { path: page, anchor };
}
