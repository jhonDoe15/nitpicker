import { existsSync, readdirSync, readFileSync } from 'node:fs';

const REPOSITORY_ROOT = new URL('../../../', import.meta.url);
const NOT_SLUG = /[^\p{L}\p{N}\s_-]/gu;
const FENCE = /^\s*```/u;

/** The anchors GitHub gives the headings of a Markdown text, outside code blocks. */
export function headingAnchors(text) {
  const anchors = [];
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

/**
 * The files of a guide (`docs/<name>.md`, relative to the repository root): the guide itself, then
 * its topic pages in `docs/<name>/`, in name order.
 */
export function guidePages(guide) {
  const folder = new URL(guide.replace(/\.md$/u, '/'), REPOSITORY_ROOT);
  const pages = existsSync(folder)
    ? readdirSync(folder)
        .filter((name) => name.endsWith('.md'))
        .toSorted()
        .map((name) => `${guide.replace(/\.md$/u, '')}/${name}`)
    : [];
  return [guide, ...pages];
}

const texts = new Map();

/** The text of `page`, a file of this repository, read once per process. */
export function guideText(page) {
  if (!texts.has(page)) {
    texts.set(page, readFileSync(new URL(page, REPOSITORY_ROOT), 'utf8'));
  }
  return texts.get(page);
}

/**
 * Where the heading `anchor` of `guide` is: `{ path, anchor }`, the topic page that holds it when
 * the section moved there (without the anchor when it is the page's title), so a link written
 * against the guide keeps working. The guide itself when no page has it.
 */
export function guideLink(guide, anchor) {
  if (anchor === undefined) {
    return { path: guide };
  }
  const page = guidePages(guide).find((file) => headingAnchors(guideText(file)).includes(anchor));
  if (page === undefined || page === guide) {
    return { path: guide, anchor };
  }
  return headingAnchors(guideText(page))[0] === anchor ? { path: page } : { path: page, anchor };
}
