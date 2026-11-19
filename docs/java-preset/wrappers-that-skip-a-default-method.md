# Wrappers that skip a default method

A class that wraps an object of an interface and forwards the interface to it, but does not override one of
the interface's `default` methods, is an enforceable `pmd/DelegateSkipsDefaultMethod` finding
(`languages/java/adapters/review-rules/delegate-defaults/`). Callers of the skipped method get the default
on the wrapper and never reach the delegate, so its metrics, capability flag or callback is lost. This
usually appears after the interface gains a default method. The rule is read from the main sources of every
module and printed as a PMD rule, so it runs the same on Gradle and Maven builds. The finding is on the
class declaration and names the delegate field and the skipped methods.

- **The wrapper:** a class declared in the project that implements a project interface `I` (directly, through a
  super-interface or through a project superclass) and has a non-static field of type `I` (declared in the class
  or in a project superclass, not annotated `@Delegate`), where at least two of its methods are a single
  forwarding call `delegate.m(a, b)` (`return` or a statement, `this.delegate` allowed, the same arguments in
  order, optionally inside `synchronized (...) { }`) and at least 80% of its methods that override a method of
  `I` are such calls. A class whose superclass is not a project class is not reported.
- **The skipped method:** a `default` method of `I` or of a super-interface whose body makes no call on
  `this` (a constant, a no-op, a `throw`, a call on another object), that neither the class, a project
  superclass nor a project subclass declares, and that is not redeclared abstract. Methods match by name and
  arity, and overloads whose parameter types are different primitives or `String`/boxed types stay apart. A
  default that a sub-interface or another implemented interface rebuilds from other methods is not skipped. A
  class that skips more than three defaults is not reported: it relies on them. An abstract wrapper is
  reported unless a project subclass declares the method.
- **Names:** a type name resolves to a project type of the same package, an explicit or wildcard import, or an
  enclosing scope; a name imported from outside the project resolves to nothing.
- **Allowed forms, not reported:** forwarding the method (`return delegate.getMetrics();`), or overriding it
  with `I.super.getMetrics()` to keep the default on purpose; a default built from the other methods of the
  interface (`return length() * 2;`), which the forwarded methods already cover; a class that mostly
  transforms its calls instead of forwarding them; a field of a type outside the project.
- **Not covered:** test sources and files under `exclude`, anonymous classes, a delegate reached through a
  getter, an interface or superclass from a library, and Kotlin classes (the Kotlin half is tracked in #1877).

The message names the interface, the delegate field and the skipped methods, and ends with the exception
sentence for `{ "rule": "pmd/DelegateSkipsDefaultMethod", "paths": ["<file>"], "reason": "..." }`. Tests:
`adapters/review-rules/delegate-defaults/delegate-skips-default.test.mts`.
