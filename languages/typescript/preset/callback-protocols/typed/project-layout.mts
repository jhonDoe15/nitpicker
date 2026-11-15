import type { Layout as HeadLayout } from '../../../adapters/typed/head-policy.mts';
import type { Layout as SourceLayout } from '../../architecture/typed/boundary-types.mts';
import { readLayout as readUntypedLayout } from '../../head-policy.mjs';

export type ProjectLayout = HeadLayout & SourceLayout;

export const readLayout: () => ProjectLayout = readUntypedLayout;
