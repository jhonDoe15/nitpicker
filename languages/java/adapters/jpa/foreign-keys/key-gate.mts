import { foreignKeyGate as sharedGate } from '../../../../../shared/hygiene/schema/foreign-key-gate.mjs';
import { yamlDocuments } from '../../../../../core/tooling/yaml/yaml-documents.mjs';

export const FOREIGN_KEY_RULE = 'JpaUnindexedForeignKey';

const gateOf: (root: string, documents: unknown) => (file: string) => boolean = sharedGate;

export function foreignKeyGate(projectRoot: string): (file: string) => boolean {
  return gateOf(projectRoot, yamlDocuments);
}
