import { readReferenceEntries, referenceLinks, withHelpUris } from '../store.mjs';

const BLOB_PATH = /\/blob\/[^/]+\/([^#]+)#(.+)$/u;

function uriProblem(helpUri, targets) {
  const match = BLOB_PATH.exec(helpUri);
  if (match === null) {
    return `${helpUri} is not a link to a page of the reference`;
  }
  const [, file, anchor] = match;
  return targets.has(`${file}#${anchor}`) ? undefined : `${helpUri} names no anchor of ${file}`;
}

/**
 * What is wrong with the reference links of real findings: an enforceable finding whose rule has
 * no entry, or a `helpUri` whose page or anchor the reference does not have.
 */
export function helpUriProblems(findings) {
  const targets = new Set(
    readReferenceEntries().map(({ page, anchor }) => `docs/rules/${page}.md#${anchor}`),
  );
  return withHelpUris(findings, referenceLinks()).flatMap((finding) => {
    const id = `${finding.tool}/${finding.rule}`;
    if (finding.helpUri === undefined) {
      return finding.classification === 'enforceable' ? [`${id} has no entry`] : [];
    }
    const problem = uriProblem(finding.helpUri, targets);
    return problem === undefined ? [] : [`${id}: ${problem}`];
  });
}
