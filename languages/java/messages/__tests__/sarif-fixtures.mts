import { readFileSync } from 'node:fs';
import { ingestSarif } from '../../../../shared/ingest/sarif.mjs';
import { temporaryRootMaker, writeFiles } from '../../__tests__/temporary-roots.mts';

export type SarifResult = {
  ruleId: string;
  message: { text: string };
  locations: {
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number; startColumn: number };
    };
  }[];
};
export type Ingested = { message: string; identity: string };
type Position = { line: number; column: number };

export const ingest: (log: unknown, options: { tool: string }) => { findings: Ingested[] } =
  ingestSarif;

export function sourceProjectMaker(prefix: string, file: string): (source: string) => string {
  const makeRoot = temporaryRootMaker(prefix);
  return (source) => {
    const root = makeRoot();
    writeFiles(root, { [file]: source });
    return root;
  };
}

export function rulesetMessage(ruleset: string, rule: string): string | undefined {
  const xml = readFileSync(ruleset, 'utf8');
  return /message="([^"]*)"/u.exec(xml.slice(xml.indexOf(`<rule name="${rule}"`)))?.[1];
}

export function positionAt(source: string, offset: number): Position {
  const before = source.slice(0, offset).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

export function sarifResult(
  { ruleId, text, file }: { ruleId: string; text: string; file: string },
  { line, column }: Position,
): SarifResult {
  return {
    ruleId,
    message: { text },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: file },
          region: { startLine: line, startColumn: column },
        },
      },
    ],
  };
}
