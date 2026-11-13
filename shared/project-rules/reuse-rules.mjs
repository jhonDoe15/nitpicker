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
        'a production module outside a feature (`layout.featureRoots`) that imports a module behind its public face (Python: other than `__init__.py` and the modules directly in the feature folder not named `_*`; Java and Kotlin: a class in a sub-package of the feature package, from compiled class dependencies, left to ArchUnit `spring-feature-boundary` in a Spring app without `layout.featureRoots`); TypeScript and JavaScript: dependency-cruiser `feature-internals-only-through-index`, `features-do-not-import-other-feature-internals`',
    },
    {
      id: ids.sharedImportsFeature,
      check: 'coupling',
      limit:
        'a production module under a shared root (`layout.sharedRoots`) that imports a feature module; Java and Kotlin in a Spring app without `layout.featureRoots`: ArchUnit `spring-shared-pure`; TypeScript and JavaScript: dependency-cruiser `shared-does-not-import-features`',
    },
    {
      id: ids.featureCycle,
      check: 'coupling',
      limit:
        'a runtime import between two features that closes a cycle of features (imports only for the type checker do not count; Java and Kotlin: compiled class dependencies, and a Spring app without `layout.featureRoots` has its root sub-packages as features); TypeScript and JavaScript: dependency-cruiser `no-production-cycles`, which reports every module cycle',
    },
    {
      id: ids.foreignFeaturePersistence,
      check: 'coupling',
      limit:
        "a production module of one feature that uses a persistent entity or data access module of another feature, also through that feature's public face (re-exports are followed by name); TypeScript and JavaScript: a module importing a database client or ORM, or defining TypeORM, MikroORM, Sequelize, Mongoose or Drizzle tables, reported by the `structure` check; Python: a module importing a database driver or ORM session API, or defining Django, SQLAlchemy, SQLModel (`table=True`), Peewee, Tortoise or document models; Java and Kotlin: `@Entity`, `@MappedSuperclass`, Spring Data `@Document`, `@Table`, `@RedisHash`, `@Node`, Exposed tables and entities, `@Repository`, Spring Data repository interfaces, or a class using JDBC, JPA `EntityManager`, Hibernate sessions, Spring JDBC, R2DBC or Mongo templates, jOOQ or Jdbi; read models (`@Immutable`, `@Subselect`, `@View`, TypeORM `@ViewEntity`) are not persistence",
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
      limit:
        'packages that depend on each other in a loop, one finding per package (Java and Kotlin: compiled class dependencies, so mixed Java and Kotlin edges count); a cycle that a reported `feature-cycle` fully explains (its packages lie in two or more features of that cycle, and removing the edges of that feature cycle leaves no cycle) is left to that rule',
      enforcedBy: withoutTypescript,
    },
  ];
}
