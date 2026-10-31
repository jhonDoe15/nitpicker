export const STRUCTURE_NOTES = {
  'unused-prop': [
    'A prop the project declares that no caller passes (a spread of a non-literal passes all).',
    'An option or prop nobody sets is dead surface that every reader has to understand.',
    'Remove the prop, or pass it from a real caller.',
  ],
  'unused-option': [
    'A property of the options parameter of an exported function that no call sets; in Kotlin, a defaulted parameter of a private or internal function that no call names or fills.',
    'An option nobody sets is dead surface that every reader has to understand.',
    'Remove the option, or set it from a real call.',
  ],
  'test-only-export': [
    'An export, module or main class that only tests use (a re-export is not an import).',
    'Code that only tests call is not part of the product, and its tests prove nothing about it.',
    'Remove `export` or make the declaration private, move a test-only module to a test-support folder, or use it from production code.',
  ],
  'shared-used-by-one-feature': [
    'A module under a shared root that exactly one feature reaches and nothing else uses.',
    '`shared` is for code several features use; code with one user belongs with it.',
    'Move the module into the feature that uses it.',
  ],
  'duplicate-definition': [
    'A used literal constant, function or type with the same name and text in two modules of a package.',
    'Two copies of one definition drift apart.',
    'Define it once in one module and import it where it is used.',
  ],
  'sibling-copy-edit': [
    'A function or class edited so that it drifts from its same-named copy in another module while that copy is left unedited.',
    'Editing one of two near-identical copies leaves the other with the old bug.',
    'Edit the copy as well, or merge the copies into one.',
  ],
  'exported-name-collision': [
    'Two different exports with one name, imported by the same module, which keeps the name for one of them.',
    'Two things with one name make an import ambiguous to read.',
    'Rename one of the exports.',
  ],
  'redefined-library-component': [
    'A component named like one the project already renders from a dependency.',
    'A second copy of a library component diverges from the real one.',
    "Use the library's component.",
  ],
  'new-icon-asset': [
    'A new icon-sized `.svg` file while an icon package is a dependency.',
    'Icons from one package look consistent; one-off files pile up.',
    'Use an icon from the icon package instead of adding a file.',
  ],
  'component-story-missing': [
    'A component file without a story, in a package that has Storybook.',
    'When most components have a story, a component without one is an oversight.',
    'Add a story for the component. The rule is enforced only when more than half of the component files have one.',
  ],
  'javascript-in-typescript-project': [
    'A `.js`, `.mjs`, `.cjs` or `.jsx` file in a project that has a `tsconfig.json`.',
    'JavaScript in a TypeScript project has no type checking.',
    'Write the file as `.ts` or `.tsx`.',
  ],
  'committed-env-file': [
    'A committed `.env` file (templates such as `.env.example` are fine).',
    'An env file holds real secrets and values that differ per machine.',
    'Remove the file from version control, ignore it, and commit a `.env.example` template.',
  ],
  'committed-private-key': [
    'A committed private key: a key file, or any text file holding a private-key block.',
    'A key in git is a leaked key.',
    'Remove the key from the repository, rotate it, and load it from a secret store or the environment.',
  ],
  'committed-binary': [
    'A committed archive or compiled binary (`gradle-wrapper.jar` is allowed).',
    'Binaries bloat the history, cannot be reviewed and go stale.',
    'Remove the file; fetch or build it in the build instead.',
  ],
  'large-file': [
    'A committed file larger than the limit (lockfiles are exempt).',
    'Large files bloat every clone for ever.',
    'Keep large data outside the repository (artifact storage, Git LFS).',
  ],
  'committed-build-output': [
    'A committed build output folder (`dist`, `build`, `out`, `coverage` or `target` next to a project manifest; `.next`, `.nuxt`, `storybook-static`, `.turbo` or `.parcel-cache` anywhere).',
    'Build output is generated, so committing it creates noise and merge conflicts.',
    'Remove the folder from version control and add it to `.gitignore`.',
  ],
  'unused-dependency': [
    'A dependency in `package.json` that nothing imports or runs.',
    'Unused dependencies add install time and attack surface.',
    'Remove it from `package.json`.',
  ],
  'unlisted-dependency': [
    'An import of a package that `package.json` does not list.',
    'An unlisted package works only by accident of what else is installed.',
    'Add the package to the right dependencies of `package.json`.',
  ],
  'unresolved-import': [
    'An import that resolves to no file and no package.',
    'It fails when the code runs.',
    'Fix the path, or install the package and list it in `package.json`.',
  ],
};
