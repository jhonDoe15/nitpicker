const QUALIFIED_NAMES =
  "Go code names another package's export through the package (`billing.Total`, `report.Total`), so two exports with one name never meet unqualified, and two dot imports that both define a name do not compile";
const NO_REEXPORT =
  'the language has no re-exports: a class has one importable name, in the package that declares it, so there is no public path to the same class to go around (a facade is a different class)';

export function entryPointRule(ids, enforcedBy) {
  return {
    id: ids.publicAlternativeBypass,
    check: 'entry-points',
    limit: 'none: importing around a public entry point fails',
    enforcedBy,
    notApplicable: { java: NO_REEXPORT },
  };
}

function featureFolderRules(ids) {
  return [
    {
      id: ids.sharedUsedByOneFeature,
      check: 'coupling',
      limit:
        'a module under a shared root (`layout.sharedRoots`) that exactly one feature reaches and nothing else uses',
    },
    {
      id: ids.featureInternalImport,
      check: 'coupling',
      limit:
        'a production module outside a feature (`layout.featureRoots`) that imports a module behind its public face (Python: other than `__init__.py` and the modules directly in the feature folder not named `_*`); TypeScript and JavaScript: dependency-cruiser `feature-internals-only-through-index`, `features-do-not-import-other-feature-internals`',
    },
    {
      id: ids.sharedImportsFeature,
      check: 'coupling',
      limit:
        'a production module under a shared root (`layout.sharedRoots`) that imports a feature module; TypeScript and JavaScript: dependency-cruiser `shared-does-not-import-features`',
    },
    {
      id: ids.featureCycle,
      check: 'coupling',
      limit:
        'a runtime import between two features that closes a cycle of features (imports only for the type checker do not count); TypeScript and JavaScript: dependency-cruiser `no-production-cycles`, which reports every module cycle',
    },
  ];
}

export function reuseRules(ids, reactEnforcedBy) {
  return [
    ...featureFolderRules(ids),
    {
      id: ids.duplicateDefinition,
      check: 'structure',
      limit:
        'a used literal `const`, function or `type` with one name and text in two modules of a package (Java and Kotlin: a source file is a module, a static, `object` or top-level function a function; Go: top-level functions outside build-constrained files, a `.go` file is a module and the packages of a Go module are one package)',
    },
    {
      id: ids.siblingCopyEdit,
      check: 'structure',
      limit:
        'a function or class edited so that it drifts from its same-named copy in another module of the package, at least 80% the same tokens before and after, while that copy is left unedited (Java and Kotlin: top-level classes and static, `object` and top-level functions; Go: top-level functions outside build-constrained files, across the packages of a Go module)',
    },
    {
      id: ids.exportedNameCollision,
      check: 'structure',
      limit:
        'two different exports with one name that a module imports both of, keeping the name for one (Java: one imported, the other written fully qualified; Java and Kotlin functions overload, so they are left out)',
      notApplicable: { go: QUALIFIED_NAMES },
    },
    {
      id: ids.redefinedLibraryComponent,
      check: 'structure',
      limit: 'React only: a component named like one the project renders from a dependency',
      enforcedBy: { ...reactEnforcedBy, javascript: 'partial' },
    },
    {
      id: ids.newIconAsset,
      check: 'structure',
      limit: 'React only: a new icon-sized `.svg` file while an icon package is a dependency',
      enforcedBy: reactEnforcedBy,
    },
  ];
}
