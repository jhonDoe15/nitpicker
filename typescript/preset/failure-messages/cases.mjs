import loggingConfig from '../eslint-config/logging.mjs';
import { adapterFailureMessageCases } from './adapter-cases.mjs';

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
  ...adapterFailureMessageCases,
];
