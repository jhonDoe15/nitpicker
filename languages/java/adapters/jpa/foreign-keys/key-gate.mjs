import { foreignKeyGate as sharedGate } from '../../../../../shared/hygiene/schema/foreign-key-gate.mjs';
import { yamlDocuments } from '../../../../../core/tooling/yaml/yaml-documents.mjs';

export const FOREIGN_KEY_RULE = 'JpaUnindexedForeignKey';

export function foreignKeyGate(projectRoot) {
  return sharedGate(projectRoot, yamlDocuments);
}
