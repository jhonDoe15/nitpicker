import path from 'node:path';
import { RULE_IDS } from '../../../../../../shared/policy.mjs';
import { reuseFinding } from '../../../../../../shared/rules/reuse/reuse-finding.mjs';

const ICON_SIZE_LIMIT = 48;
const FRAMEWORK_ICON = /^(?:favicon|icon|apple-icon)\.svg$/iu;
const BRAND_MARK = /logo|brand/iu;

function isIconSized({ width, height }) {
  return (
    (width !== undefined || height !== undefined) &&
    (width === undefined || width <= ICON_SIZE_LIMIT) &&
    (height === undefined || height <= ICON_SIZE_LIMIT)
  );
}

function isIconLike(file) {
  const name = path.posix.basename(file.path);
  return !FRAMEWORK_ICON.test(name) && !BRAND_MARK.test(name) && isIconSized(file.size);
}

export function iconAssetFindings(svgs, { analyzerName, iconPackage, isExcepted }) {
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
            values: { package: iconPackage, path: file },
          }),
        );
}
