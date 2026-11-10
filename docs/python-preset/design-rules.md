# Design rules

Part of the [Python preset guide](../python-preset.md).

The shared deep-module design rules (`mutable-state-escape`, `context-threading`, `caller-protocol`,
`protocol-contract`, `forwarding-chain`, `disjoint-consumer-groups`, `data-clump`,
`repeated-policy-decision` and `foreign-state-decision`, listed in [`spec/checks.md`](../../spec/checks.md))
run on Python sources. They are report-only, except `mutable-state-escape` and `protocol-contract` (a
call that breaks a `protocols` contract), which fail. Test files, generated files and files matched by `exclude` are not judged.

The rules read facts that the rules script produces from the same `ast` parse as its other checks,
so they need no extra tool and no import of your code. The producer follows what it can prove from
the source: imports (including relative ones and re-exports), class hierarchies, annotations, and
variables whose assignments all agree on one type. A call on a value it cannot type, such as an
unannotated parameter, an attribute assigned from one, a `getattr` or a decorator that wraps the
function, is left out rather than guessed, so annotating a parameter or a field is what makes more
of your code visible to the rules.

A `with` block on one of your classes counts as the calls its `__enter__` makes on `self`, and as
closing it with the calls its `__exit__` makes, so `protocols` can describe a lifecycle that a
`with` statement guarantees:

```json
{ "protocols": [{ "type": "Session", "open": ["begin"], "close": ["commit", "rollback"] }] }
```

A `contextlib.ExitStack` (or `AsyncExitStack`) used in a `with` closes what you register on it:
`stack.callback(x.close)` and `stack.enter_context(x)` count as closing `x`. A `finally` inside a
nested function counts only when that function is called where it is defined. A contract on a
class, a `Protocol` or an ABC also covers its subclasses in the project, so an inherited `begin` and
an overriding `commit` are one lifecycle.

A folder with a `pyproject.toml` that names a `build-backend` and is not classified
`Private :: Do Not Upload` is a published distribution. Its public names (module-level classes and
functions without a leading `_` in its packages, its single-file modules and the folders of a
namespace package, limited by `__all__` where a module has one, plus what a public module of it
re-exports) are not judged by the rules about an API's shape (`context-threading`, `disjoint-consumer-groups`,
`data-clump`, the repeated sequences of `caller-protocol` and the head of a `forwarding-chain`),
because their callers outside the project are unknown.

If the producer fails, the `python` analyzer reports one `design-failed` tool error instead of
passing silently.
