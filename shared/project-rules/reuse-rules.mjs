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
      id: ids.packageCycle,
      check: 'coupling',
      limit:
        'a production package in a dependency cycle with other packages, one finding per package of the cycle (Java and Kotlin: compiled class dependencies, so mixed Java and Kotlin edges count; Python: runtime imports, where a package `__init__` importing its own submodules is not a dependency); a cycle that only `feature-cycle` edges close is left to that rule (Java and Kotlin: also `shared-imports-feature` edges); TypeScript and JavaScript: dependency-cruiser `no-production-cycles`, which reports every module cycle',
      enforcedBy: { typescript: true, javascript: true, java: true, python: true, kotlin: true },
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
        'a used literal `const`, function or `type` with one name and text in two modules of a package',
    },
    {
      id: ids.siblingCopyEdit,
      check: 'structure',
      limit:
        'a function or class edited so that it drifts from its same-named copy in another module of the package, at least 80% the same tokens before and after, while that copy is left unedited',
    },
    {
      id: ids.exportedNameCollision,
      check: 'structure',
      limit:
        'two different exports with one name that a module imports both of, keeping the name for one',
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
