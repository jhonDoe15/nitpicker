# Inherited fields hidden by a local name

A local variable, parameter or field with the name of a field the class inherits from a project superclass,
in a class that also uses that inherited field, is an enforceable `pmd/HiddenInheritedField` finding
(`languages/java/adapters/review-rules/hidden-fields/`). Inside the class the short name then means the new
variable in one method and the inherited field in the next (`int size = by * 2; return size + this.size;`),
and a reader who knows the superclass reads the wrong one. PMD XPath sees one file at a time and cannot see
the fields of a superclass declared in another file, so the rule is read from the main sources of every
module and printed as a PMD rule; it runs the same on Gradle and Maven builds. The finding is on the
declaration and names the inherited field and the superclass that declares it.

- **The superclass:** the top-level `extends` of the class header; bounds of type parameters and wildcards do
  not count. A simple name resolves as Java does: a type of an enclosing scope, then a single-type import,
  then the same package, then an on-demand (`.*`) import. A qualified name (`extends a.Base`,
  `extends Outer.Base`) resolves by its full package or enclosing type. A name imported from outside the
  project resolves to nothing, so superclasses from libraries are never followed.
- **The inherited field:** a field without `static` and without `private` of a class reached through that
  chain. A field without a modifier counts only when the class and every class between it and the declaring
  class are in the declaring class's package. The nearest class that declares the name decides: a `private`
  or `static` field of that name in a class between them hides the farther one.
- **The hiding name:** a local variable, a method parameter, a lambda parameter, a pattern variable
  (`instanceof Type name`, `case Type name ->`), a for-each, catch or try-with-resources variable, in an
  instance method of the class; or a field of the class that is not `static`. One finding per method and name.
- **The use:** the class reads or writes the inherited field through `this.name` or `super.name`, or by the
  short name in a method or field initializer where no local of that name is declared before it. A field that
  hides an inherited one is reported only when the class still reaches the inherited one through
  `super.name`. Not uses: `Outer.this.name` (a field of the enclosing instance), the package prefix of a
  qualified type name (`org.slf4j.Logger`), case labels, cast types and type arguments, annotation
  arguments, and a member of another object (`other.name`).
- **Left out, not reported:** constructor parameters, parameters of setters and withers (`setName(...)`,
  `withName(...)`), parameters the method body never reads, parameters passed on to the overridden method
  (`super.init(ctx)`), a parameter assigned to the field of that name in any form (`this.name = name`,
  `this.name = Objects.requireNonNull(name)`, `super.name = name.trim()`), static methods, instance
  initializer blocks, static fields on either side, private fields and fields the class cannot see, classes
  that declare a field of the name themselves (the same-class hidden-field rule covers those), test sources
  and files under `exclude`, and Kotlin classes (Kotlin is on hold for this rule).
- **Nested and anonymous classes:** their bodies are not read as part of the enclosing class. A nested class
  that extends a project class is checked on its own, with its own superclass chain.

The message names the hiding kind, the field and the superclass, says to rename the local name after its
own role, and ends with the exception sentence for
`{ "rule": "pmd/HiddenInheritedField", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/hidden-fields/hidden-inherited-field.test.mts`.
