import { readSource } from '../../../../../shared/hygiene/migrations/revision-graph.mjs';
import {
  foreignKeyGate,
  schemaProjectFiles,
} from '../../../../../shared/hygiene/schema/foreign-key-gate.mjs';
import { yamlDocuments } from '../../../../../core/tooling/yaml/yaml-documents.mjs';

const TOOL = 'go-rules';
const RULE = 'unindexed-foreign-key';
const GORM_OFF =
  /\b(?:DisableForeignKeyConstraintWhenMigrating|IgnoreRelationshipsWhenMigrating)\s*:\s*true\b/u;
const ENT_OFF = /\bWithForeignKeys\s*\(\s*false\s*\)/u;

function isForeignKey(entry) {
  return entry.tool === TOOL && entry.rule === RULE;
}

function isSourceFile(file) {
  return file.endsWith('.go') && !file.endsWith('_test.go');
}

function constraintsTurnedOff(projectRoot) {
  return schemaProjectFiles(projectRoot)
    .filter(isSourceFile)
    .some((file) => {
      const text = readSource(projectRoot, file) ?? '';
      return GORM_OFF.test(text) || ENT_OFF.test(text);
    });
}

export function withoutGatedForeignKeys(projectRoot, entries) {
  if (!entries.some(isForeignKey)) {
    return entries;
  }
  if (constraintsTurnedOff(projectRoot)) {
    return entries.filter((entry) => !isForeignKey(entry));
  }
  const reports = foreignKeyGate(projectRoot, yamlDocuments);
  return entries.filter((entry) => !isForeignKey(entry) || reports(entry.file));
}
