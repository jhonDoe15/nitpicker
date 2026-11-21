import type { HelpedFinding } from '../typed/entry-types.mts';
import { readReferenceEntries, referenceLinks, withHelpUris } from '../store.mts';

const BLOB_PATH = /\/blob\/[^/]+\/([^#]+)#(.+)$/u;

type ProbedFinding = HelpedFinding & { readonly classification?: string | undefined };

function uriProblem(helpUri: string, targets: ReadonlySet<string>): string | undefined {
  const match = BLOB_PATH.exec(helpUri);
  if (match === null) {
    return `${helpUri} is not a link to a page of the reference`;
  }
  const [, file = '', anchor = ''] = match;
  return targets.has(`${file}#${anchor}`) ? undefined : `${helpUri} names no anchor of ${file}`;
}

export function helpUriProblems(findings: readonly ProbedFinding[]): string[] {
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
