# Threads, I/O and remote calls

Part of the [nitpicker-java](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

- Threads: no `synchronized`, `wait` or `notify`. Lock with a private final `ReentrantLock`
  (`lock()` right before `try`, `unlock()` in `finally`) and wait on a `Condition` from it
  (`await()` in a loop, `signalAll()`).
- Output: no `System.out`/`System.err` and no `printStackTrace()`. Log with
  `System.getLogger(Foo.class.getName())`, or the project's logger. A command-line program takes a
  `PrintStream`, `Writer` or `Appendable` parameter and writes to it; only `static void main`
  passes `System.out`/`System.err` (`new Cli(System.out).run(args)`, `System.out::print`), and
  that hop is not a finding and needs no test; branches in `main` still count.
- Fan-out: bound concurrent remote or message calls. Run the tasks on a fixed pool
  (`Executors.newFixedThreadPool(8)`), take a `Semaphore` permit around each call, or work through
  fixed-size batches; never `supplyAsync` per element on the default pool or a cached or
  virtual-thread executor. Reactor: `flatMap(this::fetch, 8)` or `concatMap`, never
  `Flux.fromIterable(items).flatMap(this::fetch)` or `Mono.zip` over a list built per element.
- Child processes: wait with a deadline and destroy the child when it runs over,
  `if (!process.waitFor(30, TimeUnit.SECONDS)) process.destroyForcibly()`, reading the output on
  another thread first; never `waitFor()` or `getInputStream().readAllBytes()` alone
  (`pmd/ProcessWaitWithoutTimeout`; a build wrapper that only runs a child to completion takes an exception).
- HTTP calls: every request has a deadline. `HttpRequest.newBuilder(uri).timeout(...)`,
  `setReadTimeout` on an `HttpURLConnection`, `setDefaultRequestConfig(...)` on an Apache client
  builder, `readTimeout` on a JAX-RS `ClientBuilder`; not `URL.openStream()` or
  `HttpClients.createDefault()` (`pmd/HttpWithoutTimeout`).
- Resources: try-with-resources for anything `Closeable`, also one used once: not
  `resource.getInputStream().readAllBytes()` or `load(new JarFile(root))`
  (`pmd/UnclosedInlineResource`). No `finally` that returns or throws.
- In main code, nothing with an outside effect runs while a class loads (`ClassLoadEffect`): no
  connection, request, file access, thread, pool, sleep or JVM-wide setting in a `static` field or
  block, an enum constant, or the constructor or initializer of a `static final INSTANCE = new X()`
  singleton, nor in a method of the class they call. Do the work in a method `main` or the
  framework calls after startup (a `@Bean` method, an `ApplicationRunner`) and pass the result in,
  or create it on first use in a lazy holder
  (`private static final class Holder { static final Db INSTANCE = new Db(); }`). Constants,
  loggers, `Pattern.compile` and collections stay static.
