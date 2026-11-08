# Size and dependencies

Part of the [nitpicker-python](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- A function stays within 50 lines, 15 statements, 2 levels of control nesting and 3 parameters;
  past 3 parameters, pass a frozen dataclass. A `lambda` is a function of its own with the same
  limits, counted on its own and not toward the function around it. Complex code needs tests: the
  CRAP score of a function must stay below 9.
- Each `if`, loop, `match` and `except` handler adds a nesting level; an `elif` adds none. Return
  early, look the value up in a dict, or move a branch into a helper.
- A new clone of at least 5 lines and 50 tokens (`duplicate-clone`) fails: extract a function, also when the copy has other names and literals. A
  package must not depend on a less stable one (`stability-direction`).
- A class has at most 20 methods and 10 fields, and at most 3 project base classes above it
  (`Exception` or `models.Model` add none). A package sits at most 4 levels below the root package. Modules and packages must not import
  each other in a cycle, and production code imports only from the source roots. When a package's `__init__.py` re-exports a
  name, code outside the package imports it from the package (`from shop.billing import Invoice`), not from the module inside it.
- A module stays within 300 lines (a test module 500) and a line within 120 characters. A folder
  holds at most 6 modules and 6 test modules directly: group the rest into packages by what they do.
- Dependencies: every package production code imports is a production dependency of the project
  (pyproject, Pipfile, requirements or setup.cfg); test-only packages go in a dev group; remove a
  dependency nothing uses.
