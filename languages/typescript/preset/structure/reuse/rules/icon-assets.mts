import path from 'node:path';
import { RULE_IDS, reuseFinding } from '../typed/reuse-views.mts';
import type { Finding } from '../../../../../../shared/values/findings.mts';
import type { SvgFile, SvgSize } from '../typed/reuse-types.mts';

const ICON_SIZE_LIMIT = 48;
const FRAMEWORK_ICON = /^(?:favicon|icon|apple-icon)\.svg$/iu;
const BRAND_MARK = /logo|brand/iu;

function isIconSized({ width, height }: SvgSize): boolean {
  return (
    (width !== undefined || height !== undefined) &&
    (width === undefined || width <= ICON_SIZE_LIMIT) &&
    (height === undefined || height <= ICON_SIZE_LIMIT)
  );
}

function isIconLike(file: SvgFile): boolean {
  const name = path.posix.basename(file.path);
  return !FRAMEWORK_ICON.test(name) && !BRAND_MARK.test(name) && isIconSized(file.size);
}

export function iconAssetFindings(
  svgs: readonly SvgFile[],
  {
    analyzerName,
    iconPackage,
    isExcepted,
  }: {
    readonly analyzerName: string;
    readonly iconPackage: string | undefined;
    readonly isExcepted: (rule: string, ...candidates: readonly string[]) => boolean;
  },
): Finding[] {
  return iconPackage === undefined
    ? []
    : svgs
        .filter(isIconLike)
        .filter(({ path: file }) => !isExcepted(RULE_IDS.newIconAsset, file))
        .map(({ path: file }) =>
          reuseFinding(analyzerName, {
            key: 'newIconAsset',
            path: file,
            identity: 'new-icon-asset',
            symbol: undefined,
            line: undefined,
            values: { package: iconPackage, path: file },
          }),
        );
}
