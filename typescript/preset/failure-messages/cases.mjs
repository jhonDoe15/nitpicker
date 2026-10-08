import loggingConfig from '../eslint-config/logging.mjs';
import strictDomainConfig from '../eslint-config/strict-domain.mjs';

// Add one entry per banned form. `config` is any ESLint flat config array; `banned` is a fixture
// that must fail; `allowed` is the wording the message must use to name the allowed form.
export const failureMessageCases = [
  {
    name: 'console call names the application logger',
    config: loggingConfig,
    filename: 'src/service.ts',
    banned: 'console.log("started");',
    allowed: 'application logger',
  },
  {
    name: 'domain recursion names flatMap',
    config: strictDomainConfig,
    filename: 'src/main/features/billing/domain/total.ts',
    banned: 'function total(items) { return items.length === 0 ? 0 : 1 + total(items.slice(1)); }',
    allowed: 'flatMap',
  },
  {
    name: 'domain arrow recursion names flatMap',
    config: strictDomainConfig,
    filename: 'src/main/features/billing/domain/walk.ts',
    banned: 'const walk = (node) => node.children.flatMap((child) => walk(child));',
    allowed: 'flatMap',
  },
  {
    name: 'domain throw names the discriminated-union result',
    config: strictDomainConfig,
    filename: 'src/main/features/billing/domain/parse.ts',
    banned: 'function parse(input) { if (!input) { throw new Error("empty"); } return input; }',
    allowed: 'discriminated-union failure result',
  },
];
