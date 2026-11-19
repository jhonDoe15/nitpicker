# Self-recursion

A method or function that calls itself, directly or through another function of the same file, is an enforceable
`pmd/SelfRecursion` finding (`languages/java/adapters/review-rules/self-recursion/`), in the Java and Kotlin
presets alike. Recursion over input of unknown depth overflows the stack. The rule is read from the main sources
of every module and printed as a PMD rule, so it runs the same on Gradle and Maven builds. The finding is on the
recursive call.

- **Direct recursion:** a call `name(...)` or `this.name(...)` inside the body of a method or function called
  `name` with the same number of arguments.
- **Mutual recursion:** two or more functions of one file that call each other (`isEven` and `isOdd`). The cycle is
  reported once, on the call of the function declared first.
- **Allowed forms, not reported:** a retry or poll written as a loop over attempt numbers; a tree walk (directories,
  AST, JSON) written as a loop over a worklist (`Deque`, `ArrayDeque`) that each step adds the node's children to; flat
  data handled with a stream (`map`, `flatMap`) or, in Kotlin, `map`, `flatMap` or `fold`.
- **Not reported:** an overload that delegates to another overload with a different number of arguments, a name that two
  methods of the file share with the same number of arguments (the call cannot be told apart without types), a call
  on another receiver (`child.walk()`), a call inside a callback handed to `schedule`, `scheduleAtFixedRate`,
  `addListener`, `subscribe` and the like, test sources, and a method whose body has no condition, loop, `try` or
  `throw`, which Error Prone `InfiniteRecursion` already reports.

The message names the function and the allowed forms, and ends with the exception sentence for
`{ "rule": "pmd/SelfRecursion", "paths": ["<file>"], "reason": "..." }`; an exception fits only when the recursion
is bounded and deliberate. Tests: `adapters/review-rules/self-recursion/self-recursion.test.mts`. The Go counterpart is
`go-rules/self-recursion`; the TypeScript, JavaScript and Python counterparts are listed in their presets.
