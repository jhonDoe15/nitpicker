import { describeEngineParity } from '../../test-support/engine-parity.mts';

const TYPE = 'export class OrderHelper {}\n';
const PLAIN = 'export const rate = 1;\n';
const ALLOWED = 'export class PriceRounder {}\nexport class CacheManager {}\n';

const BANNED_FILES = (extension: string) => ({
  [`src/main/string-utils.${extension}`]: PLAIN,
  [`src/main/common/rates.${extension}`]: PLAIN,
  [`src/main/orders.${extension}`]: TYPE,
});

const EXPECTED = (extension: string) => [
  `src/main/common/rates.${extension}:1`,
  `src/main/orders.${extension}:1`,
  `src/main/string-utils.${extension}:1`,
];

function caseFor(javascript: boolean, extension: string) {
  return {
    javascript,
    files: {
      ...BANNED_FILES(extension),
      [`src/main/price-rounding.${extension}`]: ALLOWED,
      'test/helpers/utils.mjs': TYPE,
    },
    expected: EXPECTED(extension),
  };
}

describeEngineParity({
  title: 'generic names',
  itTitle: 'reports files, folders and types in production code only, on both engines',
  rule: 'nitpicker/no-generic-name',
  prefix: 'nitpicker-generic-name-',
  policy: 'production-layout',
  environment: process.env,
  typeAwareFallback: false,
  cases: [caseFor(false, 'ts'), caseFor(true, 'mjs')],
});
