const COUPLING = 'coupling';
const QUALIFIED_NAMES =
  "Go code names another package's export through the package (`billing.Total`, `report.Total`), so two exports with one name never meet unqualified, and two dot imports that both define a name do not compile";
const NO_REEXPORT =
  'the language has no re-exports: a class has one importable name, in the package that declares it, so there is no public path to the same class to go around (a facade is a different class)';

export function entryPointRule(ids, enforcedBy) {
  return {
    id: ids.publicAlternativeBypass,
    check: 'entry-points',
    limit:
      "none: importing around a public entry point fails, an import from inside a folder of a name the folder's entry point re-exports, from outside the folder and not from a composition root (TypeScript: the `index.ts` of a top-level source folder; Python: the `__init__.py` of a top-level package, or of each subpackage when there is one top-level package, that lists the name in `__all__`; Kotlin, for Kotlin code: a public `typealias` of a class in a subpackage)",
    enforcedBy,
    notApplicable: { java: NO_REEXPORT },
  };
}

function featureFolderRules(ids) {
  return [
    {
      id: ids.sharedUsedByOneFeature,
      check: COUPLING,
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
      id: ids.nearDuplicate,
      check: 'structure',
      limit:
        'two production functions whose syntax trees are proved copies: the same apart from renamed locals, or apart from at most 4 values, literals or types, or sharing a run of at least 3 statements (30 tree nodes) that leaves at most one value for the code after it; or the same logic written another way: a loop and the `any`/`all`/stream call that replaces it, a call to a same-file helper that cannot be overridden and the body of that helper, or guards and local values that a solver (Z3, fixed resource limit) proves equal for every input (arithmetic is an opaque value: integers overflow and floats round); both need at least 30 shared tree nodes, 80% of each function. Each pair is one finding, at the copy that sorts last. Copies that differ only in names and string or number literals, both large enough for `duplicate-clone` (5 lines, 100 tokens), are left to it. Java and Kotlin copies that differ only in primitive, boxed or generic types (`int`/`long`, `Integer`, `Object`, `T`), the helpers named after those types and sizes, in one file or in sibling files named after the types (`Ints`, `Longs`), are a type-specialized family and are left out, and so are the platform variants of one Kotlin Multiplatform declaration in different `src/<platform>Main/` source sets',
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

export function couplingRules(ids, { everyLanguage, withoutTypescript }) {
  return [
    {
      id: ids.stabilityDirection,
      check: COUPLING,
      limit:
        'a package depending on a less stable package; a feature folder is one unit, and edges between its public face and its own internals do not count; an import that exists only for the type checker (`import type`, `if TYPE_CHECKING:`) is never the reported dependency, but still counts toward instability',
      enforcedBy: everyLanguage,
    },
    {
      id: ids.packageCycle,
      check: COUPLING,
      limit: 'packages that depend on each other in a loop',
      enforcedBy: withoutTypescript,
    },
  ];
}
