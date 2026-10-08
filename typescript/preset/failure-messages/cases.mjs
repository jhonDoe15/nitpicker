import loggingConfig from '../eslint-config/logging.mjs';
import strictAdaptersConfig from '../eslint-config/strict-adapters.mjs';

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
    name: 'adapter for(;;) names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'for (let i = 0; i < 3; i++) { run(i); }',
    allowed: 'for...of',
  },
  {
    name: 'adapter for...in names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'for (const key in record) { run(key); }',
    allowed: 'for...of',
  },
  {
    name: 'adapter while names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'while (queue.length > 0) { run(queue.pop()); }',
    allowed: 'for...of',
  },
  {
    name: 'adapter do-while names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'do { run(); } while (more());',
    allowed: 'for...of',
  },
  {
    name: 'adapter forEach names for...of',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'items.forEach((item) => run(item));',
    allowed: 'for...of',
  },
  {
    name: 'adapter then chain names async/await',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'fetchOne().then((value) => use(value));',
    allowed: 'async/await',
  },
  {
    name: 'adapter catch chain names async/await',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'fetchOne().catch((error) => use(error));',
    allowed: 'try/catch',
  },
  {
    name: 'adapter bare Error names Error subclass',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: "function f() { throw new Error('failed'); }",
    allowed: 'Error subclass',
  },
  {
    name: 'adapter literal throw names Error subclass',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: "function f() { throw 'failed'; }",
    allowed: 'preserves cause',
  },
  {
    name: 'adapter silent catch names logging',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch (error) { cleanup(); }',
    allowed: 'log',
  },
  {
    name: 'adapter empty catch is rejected',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch (error) {}',
    allowed: 'caught value',
  },
  {
    name: 'adapter lost cause names cause',
    config: strictAdaptersConfig,
    filename: 'src/main/features/billing/adapters/store.ts',
    banned: 'try { run(); } catch (error) { throw new Error(String(error)); }',
    allowed: 'original cause',
  },
];
