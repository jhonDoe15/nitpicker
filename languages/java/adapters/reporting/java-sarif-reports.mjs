import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dropEntityAssociations, dropInheritedVersions } from '../jpa/jpa-source-filters.mjs';
import { ingestSarif, prepareSarif } from '../../ingest/sarif.mjs';

const LINE_NUMBER = /\bline \d+\b/g;

function preparedReport(file, { reportRoot, roots, sourceRoots, projectRoot }, identityKey) {
  return prepareSarif(JSON.parse(readFileSync(path.join(reportRoot, file), 'utf8')), {
    roots,
    sourceRoots,
    projectRoot,
    identityKey,
  });
}

export function sarifFindings(context) {
  const { allSourceRoots, projectRoot } = context;
  const pmd = preparedReport('pmd.sarif', context, (result) =>
    result.message?.text?.replace(LINE_NUMBER, 'line'),
  );
  const spotbugs = preparedReport('spotbugs.sarif', context, spotbugsSubject);
  return [
    ...dropInheritedVersions(ingestSarif(pmd, { tool: 'pmd' }).findings, {
      projectRoot,
      sourceRoots: allSourceRoots,
    }),
    ...ingestSarif(dropEntityAssociations(spotbugs, projectRoot), {
      tool: 'spotbugs',
    }).findings,
  ];
}

function spotbugsSubject(result) {
  const args = result.message?.arguments;
  return Array.isArray(args) && args.length > 0 ? args.join(' ') : result.message?.text;
}
