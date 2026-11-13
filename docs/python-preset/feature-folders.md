# Feature folders

A project that groups its code by feature keeps each feature behind a small public face, keeps
shared code independent of features, keeps the features' dependencies one-way and keeps each
feature the owner of its data. Five rules,
written once for every language over the import facts (`shared/rules/features/`) and run by the
`python` analyzer as tool `coupling`, check that:

| Rule                          | Fails                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `feature-internal-import`     | production code outside a feature imports a module behind its public face                                     |
| `shared-imports-feature`      | a production module under a shared root imports any module of a feature                                       |
| `feature-cycle`               | a runtime import between two features that closes a cycle of features                                         |
| `shared-used-by-one-feature`  | a module under a shared root that only one feature reaches (and nothing else uses): move it into that feature |
| `foreign-feature-persistence` | a production module of one feature imports an entity or data access module of another feature                 |

**Which folders.** `layout.featureRoots` and `layout.sharedRoots` in `nitpicker.config.json` are
folder globs from the project root (`["src/app/features"]`); they default to `**/features` and
`**/shared`, and `"featureRoots": []` turns the rules off. Each folder directly under a feature
root is one feature, named after the folder, so a package added there is a feature at once: nothing
needs mapping and nothing escapes unmapped. A module directly in a feature root (`features/util.py`)
belongs to no feature. When feature roots nest (`["src/app/features", "src/app/features/billing/plugins"]`),
a file belongs to the innermost one: `billing/plugins/pdf/` is a feature of its own, and the rest
of `billing/` another. A shared folder that is itself the folder under a feature root
(`features/shared/`) is shared; with the default `**/shared`, one inside a feature
(`features/billing/shared/`) is part of that feature, while a folder a `sharedRoots` glob you
configure matches stays shared wherever it is. A project without a feature folder gets no finding
from these rules, and a configured `featureRoots` or `sharedRoots` glob that matches no folder is
named in a notice on each run. Packages live where `python.sourceRoots` says; the globs only decide
the roles of the files found there. A feature cannot be named `tests` or `test` (its files are
tests) or `migrations` (skipped like every migrations folder); `build` and `dist` are skipped only
at the project root and next to a `pyproject.toml` or another build manifest, so
`features/build/` is a feature.

**The public face** of a feature is its `__init__.py` and the modules directly in the feature
folder whose names do not start with `_`. Its sub-packages and its `_private.py` modules are
internal: the feature itself may import them, other code may not. A name the feature's
`__init__.py` imports from an internal module is public, so `from app.features.billing import rate`
passes while `from app.features.billing import _rates` and
`import app.features.billing.internal.tax as tax` fail. A sub-package the `__init__.py` imports
whole (`from . import models`) or lists in `__all__` is public too, so
`from app.features.billing import models` passes; its own modules stay internal.

```python
# src/app/features/billing/__init__.py: the public face
from ._rates import rate
from .invoice import Invoice

# src/app/features/orders/cart.py
from app.features.billing import Invoice, rate   # allowed: the public face
from app.features.billing import invoice         # allowed: a public module
from app.features.billing import _rates          # feature-internal-import
from app.features.billing.internal import tax    # feature-internal-import
```

- **Who is checked.** Production modules only: tests (and every module the test layout names, such
  as `conftest.py`, and a behave or pytest-bdd tree: a folder holding `.feature` files with a
  `steps/` or `step_defs/` folder or an `environment.py` next to them) may import any internal
  module. Generated modules still resolve imports, but no finding is about one: an import from or
  of a generated module is left out, and neither a generated module nor a package `__init__.py` is
  reported by `shared-used-by-one-feature`. A composition root such as `main.py` or a Django `settings.py` is outside every
  feature, so it imports features through their public face too.
- **Resolution.** The import scan of slice 5: absolute and relative imports (`from ..billing import
rate`), `import a.b as c`, and `from a import b`, which is an import of the submodule `a.b` when
  that module exists and of a name in `a` otherwise. Dynamic imports (`importlib.import_module`)
  and string references are not seen. The parent packages an import runs are not edges, so
  `import app.features.billing.internal.tax` is one finding, on `internal/tax.py`.
- **Type-only imports.** An import under `if TYPE_CHECKING:` still couples the importer to the
  feature's internals, so `feature-internal-import` and `shared-imports-feature` count it, as
  dependency-cruiser does for `import type`. It does not run, so `feature-cycle` leaves it out:
  importing a type back from the other feature for an annotation is not a cycle.
- **Cycles.** The features are the nodes and the runtime imports between files of two different
  features are the edges. A feature reached only through a shared module would need
  `shared-imports-feature` to fail first, and a loop through other modules (a composition root, an
  `app/core.py`) is a module cycle, which `package-cycle` reports. Each importing file is one
  finding per feature it imports inside a cycle; the message names the cycle's features (the first
  five) and the ways out: move what both need to a shared root, or invert the dependency behind an
  interface. A `package-cycle` whose packages all belong to the features of a reported feature cycle,
  and that no other import closes, is not reported a second time; a package cycle through a package
  outside the features, or one whose feature cycle an exception lifts, is still reported.
- **Persistence of another feature.** `foreign-feature-persistence` reports a feature module that
  imports another feature's persistence, directly or through a name its `__init__.py` re-exports
  (the import names are followed, so importing a service from the same `__init__.py` passes). A
  module is an entity when it defines a class whose base is a Django `models.Model`, a SQLAlchemy
  `DeclarativeBase`, a Peewee, Tortoise, MongoEngine, Beanie, ODMantic or Piccolo model, a
  SQLModel class with `table=True`, or a project class that is one of these, including the
  `Base = declarative_base()` and `db.Model` forms (a base from a project module that imports the
  ORM); the class list of the structure step resolves the bases through the module's imports
  (`adapters/imports/python-persistence.mjs`). A module is data access when it imports a database
  driver at run time (`sqlite3`, `psycopg`, `asyncpg`, `pymysql`, `pymongo`, `motor`, `redis`,
  `cassandra`, `elasticsearch`, `databases`, ...) or an ORM's session or query API (`Session`,
  `sessionmaker`, `create_engine`, `select`, `text`, Django's `connection`); a `TYPE_CHECKING`
  import and Django's `transaction` do not count. The finding is on the importing module,
  identity `foreign-persistence:<persistent module>`; the exception may name the importer or the
  persistent module (a read model other features may use). Modules outside the features, such as
  Alembic migrations, are not checked.
- **import-linter.** Both apply. These rules always run and need no import-linter config; a
- **Identities.** No line numbers: `feature-internal:<imported file>`, `<feature folder>|shared-imports-feature`
  and `<imported feature folder>|feature-cycle`, with the importing file as the path. Moving a file
  inside a feature, renaming a module, or moving a feature folder keeps a finding that existed
  before; a new import of another internal module, a new shared-to-feature dependency and a new
  edge into a cycle are new.
- **Exceptions.** The top-level `exceptions`, with the importing file as the path:
  `{ "rule": "feature-internal-import", "paths": ["src/app/main.py"], "reason": "..." }`. The
  message of each finding ends with that entry. `python.exceptions` does not take these rules.
- **import-linter.** Both apply. These rules always run and need no import-linter config; a
  project's import-linter contracts run as before (slice 5) and report `contract-broken` on top. A
  contract does not replace or narrow the owned rules, and the owned rules do not replace a
  contract: a stricter `layers` or `independence` contract over the same packages adds its own
  findings, and lifting one of them takes the exception of its own list.
- **TypeScript and JavaScript** enforce the same policy with dependency-cruiser
  (`feature-internals-only-through-index`, `features-do-not-import-other-feature-internals`,
  `shared-does-not-import-features`, `no-production-cycles`); Java and Kotlin do not yet.
