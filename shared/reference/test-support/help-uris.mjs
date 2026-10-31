import { readFileSync } from 'node:fs';
import path from 'node:path';
import { referenceLinks, withHelpUris } from '../store.mjs';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../..');
const BLOB_PATH = /\/blob\/[^/]+\/([^#]+)#(.+)$/u;

function pageText(file) {
  const target = path.resolve(REPOSITORY_ROOT, file);
  if (!target.startsWith(REPOSITORY_ROOT + path.sep)) {
    throw new Error(`${file} is outside the repository`);
  }
  return readFileSync(target, 'utf8');
}

function uriProblem(helpUri) {
  const match = BLOB_PATH.exec(helpUri);
  if (match === null) {
    return `${helpUri} is not a link to a page of the reference`;
  }
  const [, file, anchor] = match;
  return pageText(file).includes(`<a id="${anchor}"></a>`)
    ? undefined
    : `${helpUri} names no anchor of ${file}`;
}

/**
 * What is wrong with the reference links of real findings: an enforceable finding whose rule has
 * no entry, or a `helpUri` whose page or anchor the committed reference does not have.
 */
export function helpUriProblems(findings) {
  return withHelpUris(findings, referenceLinks()).flatMap((finding) => {
    const id = `${finding.tool}/${finding.rule}`;
    if (finding.helpUri === undefined) {
      return finding.classification === 'enforceable' ? [`${id} has no entry`] : [];
    }
    const problem = uriProblem(finding.helpUri);
    return problem === undefined ? [] : [`${id}: ${problem}`];
  });
}
