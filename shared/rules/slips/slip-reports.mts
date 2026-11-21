import { identityCounter, reuseFinding } from '../reuse/reuse-finding.mts';
import type { TreeNode } from '../../near-duplicates/tree/tree-types.mts';
import type { Finding } from '../../values/findings.mts';

type Slip = { readonly node: TreeNode; readonly subject: string; readonly fix: string };
type SlipKind = { readonly key: string; readonly prefix: string };

export function slipReports(
  unit: { readonly file: string; readonly name: string },
  slips: readonly Slip[],
  { analyzerName, key, prefix }: SlipKind & { readonly analyzerName: string },
): Finding[] {
  const numbered = identityCounter();
  return slips.map(({ node, subject, fix }) => {
    const base = `${unit.file}#${unit.name}:${node.text ?? String(node.start)}`;
    return reuseFinding(analyzerName, {
      key,
      path: unit.file,
      identity: numbered(`${prefix}:${base}`),
      symbol: unit.name,
      line: node.start,
      values: { subject, fix },
    });
  });
}
