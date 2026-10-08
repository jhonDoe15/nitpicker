import loggingConfig from '../eslint-config/logging.mjs';
import compositionRootConfig from '../eslint-config/strict-composition-root.mjs';

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
    name: 'construction in a factory-named file names the composition root',
    config: compositionRootConfig,
    filename: 'src/main/widget-factory.ts',
    banned: 'const client = new WidgetClient();',
    allowed: 'only in the composition root',
  },
  {
    name: 'construction in a feature names passing it in as a parameter',
    config: compositionRootConfig,
    filename: 'src/main/features/auth/handler.ts',
    banned: 'const client = new WidgetClient();',
    allowed: 'pass it in as a parameter',
  },
  {
    name: 'module-level let names const',
    config: compositionRootConfig,
    filename: 'src/main/state.ts',
    banned: 'let counter = 0;',
    allowed: "use 'const'",
  },
];
