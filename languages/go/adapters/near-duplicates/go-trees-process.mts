import { readFileSync } from 'node:fs';
import { Parser } from 'web-tree-sitter';
import { pathInside } from '../../../../shared/filesystem.mjs';
import { fileRequest as untypedFileRequest } from '../../../../shared/near-duplicates/trees-request.mjs';
import { loadGrammar } from '../../../java/adapters/near-duplicates/grammar/load-grammar.mts';
import { goProjectUnits } from './project-units.mts';

const fileRequest: (value: unknown) => { root: string; files: string[] } = untypedFileRequest;

function sourceOf(root: string, file: string): { file: string; text: string } {
  const full: unknown = pathInside(root, file);
  if (typeof full !== 'string') {
    throw new Error(`${file} is outside ${root}`);
  }
  return { file, text: readFileSync(full, 'utf8') };
}

async function main(): Promise<unknown> {
  const { root, files } = fileRequest(JSON.parse(readFileSync(0, 'utf8')));
  await Parser.init();
  const parser = new Parser();
  parser.setLanguage(await loadGrammar('go'));
  return goProjectUnits(
    parser,
    files.map((file) => sourceOf(root, file)),
  );
}

process.stdout.write(JSON.stringify(await main()));
