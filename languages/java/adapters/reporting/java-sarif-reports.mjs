import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dropEntityAssociations, dropInheritedVersions } from '../jpa/jpa-source-filters.mjs';
import { ingestSarif, prepareSarif } from '../../ingest/sarif.mjs';

const LINE_NUMBER = /\bline \d+\b/g;

function preparedReport(report, { roots, sourceRoots, projectRoot }, identityKey) {
  return prepareSarif(JSON.parse(readFileSync(report, 'utf8')), {
    roots,
    sourceRoots,
    projectRoot,
    identityKey,
  });
}

export function sarifFindings(context) {
  const { allSourceRoots, projectRoot } = context;
  const pmd = preparedReport(path.join(context.reportRoot, 'pmd.sarif'), context, (result) =>
    result.message?.text?.replace(LINE_NUMBER, 'line'),
  );
  const spotbugs = preparedReport(
    path.join(context.reportRoot, 'spotbugs.sarif'),
    context,
    spotbugsSubject,
  );
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
