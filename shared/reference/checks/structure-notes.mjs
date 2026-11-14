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
  'feature-internal-import': [
    'A production module outside a feature that imports a module behind the public face of that feature.',
    'A feature that others reach into cannot change its internals without breaking them.',
    "Import the feature's public face (its index file or package `__init__`), or export what you need from it.",
  ],
  'shared-imports-feature': [
    'A production module under a shared root that imports a feature module.',
    'Shared code that depends on one feature ties every other feature to it.',
    'Move the code into the feature, or move what it needs from the feature into the shared root.',
  ],
  'feature-cycle': [
    'A runtime import between two features that closes a cycle of features.',
    'Features that depend on each other cannot be understood, changed or removed one at a time.',
    'Break the cycle: move the shared part to a shared root, or invert one dependency through an interface.',
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
  'near-duplicate': [
    'Two functions proved to be copies from their syntax trees: the same apart from renamed locals, apart from up to four values, sharing a run of statements, or the same logic written another way.',
    'A copy keeps a second place to fix every bug and grows apart from the first; agents copy a function and change one literal more often than they extract one.',
    'Extract one function, with the differing values as parameters, and call it from both places. Java and Kotlin overloads that differ only in primitive, boxed or generic types are a type-specialized family and are not reported.',
  ],
  'decided-condition': [
    'A condition that the guards before it in the same function already decide: always true (a redundant check) or always false (dead code).',
    'The dead case is often a real bug: the branch the author meant to run never can.',
    'Remove the check, or fix the condition that was meant. The message names the guard that decides it.',
  ],
  'duplicate-branch': [
    'Two arms of one branch (an `if` chain, a ternary, a `switch` or a `when`) with the same body; report-only, the same statements at the start or end of every arm.',
    'Equal arms are a copy-paste left-over: either the condition is pointless or one arm was meant to differ.',
    'Merge the arms (their conditions or labels into one), or change the arm that was meant to differ; move shared statements before or after the branch.',
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
  'migration-order': [
    'A migration the change adds that sorts before the newest migration on the base branch, or an Alembic or Django migration that forks the history.',
    'A database that already ran the newer migration skips the older one or refuses to start.',
    'Create the migration again with a current version, or point it at the latest migration.',
  ],
  'migration-hardcoded-name': [
    'A migration that names the `public` schema, a database or an owner role.',
    'Another install keeps its tables in another schema, or has another database name or roles.',
    'Leave the schema out, target the current database, and leave out the owner or use `CURRENT_USER`.',
  ],
  'foreign-key-index': [
    'A foreign key a migration (SQL, Liquibase or Alembic) or an sqlc schema file adds, or a Prisma relation, with no index that starts with its columns, in a project that does not use MySQL or MariaDB.',
    'PostgreSQL does not index a foreign-key column by itself, so deleting a referenced row and every join or lookup by the column scan the whole table.',
    'Create an index that starts with the foreign-key columns in a migration (or `@@index` in the Prisma schema); a composite index counts when the columns come first.',
  ],
  'start-schema-push': [
    'A `start`, `prestart`, `serve` or `start:*` script (not `start:dev`, `start:local`, `start:watch`, `start:debug` or `start:test`) in `package.json`, or a script it runs, that pushes the ORM schema (`prisma db push`, `prisma migrate dev`, `drizzle-kit push`, `typeorm schema:sync`, `mikro-orm schema:update`).',
    'A schema push changes the database on every start without a migration, so a deploy can drop columns and their data.',
    'Apply migrations in the deploy step (`prisma migrate deploy`, `drizzle-kit migrate`, `typeorm migration:run`) and keep schema pushes for local development scripts.',
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
  'mutable-state-escape': [
    'A caller in another module that changes (push, add, put, an element assignment) a private mutable field of a class through the value an exported member of that class returned.',
    'An owner that hands out its own mutable state no longer controls it, so its rules can be broken from anywhere.',
    'Return a copy or a read-only view, or add an operation to the owner that makes the change.',
  ],
  'context-threading': [
    'A parameter of a project type with 5 or more fields passed whole through 2 or more callables, one in another module, that together read at most a third of its fields.',
    'Passing a whole context for a few of its fields makes every caller build all of it and hides what the code really needs.',
    'Pass the values that are read, or a small type with just them.',
  ],
  'caller-protocol': [
    'The same 3 or more steps on one value of a project class, repeated by 3 or more callables in 2 or more modules.',
    'A sequence every caller has to repeat is knowledge the class should own; each copy can get the order or the cleanup wrong.',
    'Give the class one operation that runs the steps, and call that.',
  ],
  'protocol-contract': [
    'A call that breaks a lifecycle the project lists in `protocols`: an `open` member without a `close` member on every exit, or a listed step before `open`.',
    'A resource used out of order or left open leaks or fails at run time.',
    'Call the steps in the listed order and close on every exit, for example in a `finally` block.',
  ],
  'forwarding-chain': [
    'Two or more forwarding hops in a row, each into another module, that pass the same parameters in order and return the result unchanged, with the same parameter and return types.',
    'Layers that only forward add indirection without hiding anything, so every reader has to follow them to find the code that works.',
    'Call the last function directly, or give the middle layers work of their own.',
  ],
  'disjoint-consumer-groups': [
    'The exported members of one module or class, used from other modules, that split into 2 or more groups no caller module uses together and that share no field or helper.',
    'A module that serves unrelated groups of callers is several modules in one, so a change for one group touches the others.',
    'Split the module along the groups.',
  ],
  'data-clump': [
    'The same 3 or more typed parameters (names and types) in 3 or more exported functions of 2 or more modules.',
    'Values that always travel together are a concept with no type, so their rules are checked in many places or nowhere.',
    'Give them one value type that owns their rules, and pass that instead.',
  ],
  'repeated-policy-decision': [
    'Two decisions in different modules over the same enum or field that group its constants the same way, with an arm covering 2 or more constants.',
    'A grouping repeated in several places is a rule of its own; a new constant has to be added to every copy.',
    'Give the type one function that answers the question, and call it from each place.',
  ],
  'foreign-state-decision': [
    'Two or more functions outside a class with behaviour that branch on the same 2 or more of its fields.',
    'Decisions over the state of a class made outside it spread its rules across the code base.',
    'Give the class a method that answers the question, and call that.',
  ],
};
