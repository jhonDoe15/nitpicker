# Own rules

Part of the [nitpicker-go](../SKILL.md) skill. The gate runs nitpicker's own analyzers as
`go-rules/<rule>` on every package. Write these forms from the start; each finding's message names
the allowed form and ends with its exception entry.

## Errors

- Return an error for an ordinary failure; never `panic` (`go-rules/panic-for-failure`). `panic`
  is for `main`, `init`, a `default` clause that cannot be reached, and a `MustX` function whose
  input the program itself wrote, such as a pattern for `regexp.MustCompile`. Re-panicking a value
  from `recover()` is fine.
- Log an error or return it, never both (`go-rules/logged-and-returned`). Return it wrapped,
  `fmt.Errorf("load order %s: %w", id, err)`, and let the caller that handles it log it once; or
  log it and handle it (fall back, retry, return `nil`). The common logging packages count: `log`,
  `log/slog`, zap, zerolog, logrus, go-kit log, klog, logr, hclog and the others listed in the
  preset's docs.

## Goroutines and contexts

- Every goroutine has an owner that waits for it or stops it (`go-rules/unowned-goroutine`): start
  it with `wg.Go(func() { ... })` and `wg.Wait()`, or an errgroup's `group.Go` and `group.Wait()`,
  or hand it a context the caller cancels or a channel the caller reads.
- Create a root context only in package `main`: `context.Background()` and `context.TODO()`
  anywhere else (`go-rules/context-outside-entry`) start a context no caller can cancel. Take
  `ctx context.Context` as the first parameter and pass it on. Tests use `t.Context()`.
- Never `time.Sleep` to wait for a goroutine you started (`go-rules/sleep-to-wait`): wait on its
  WaitGroup, errgroup, channel or context. A sleep between retries, with no goroutine started
  before it, is fine.

## Package state and design

- Keep state in values, not in package variables (`go-rules/mutable-package-state`): a package
  variable that a function assigns, increments, writes into (`cache[key] = value`) or deletes from
  is shared by every caller. Put it in a struct the caller creates and passes in. A lazy value is
  `var config = sync.OnceValue(load)`, never a `sync.Once` beside a variable. Sentinel errors
  (`var ErrNotFound = errors.New(...)`), tables that are never changed, values set in `init`,
  atomics and `sync.Map` are fine.
- `init` does not print, connect or start anything (`go-rules/init-side-effect`): write a setup
  function that `main` or a constructor calls, and initialize variables in their declaration. A
  driver or format registration (`sql.Register`, `MustRegister`) is fine.
- Return concrete types (`go-rules/lone-interface`): `func NewStore() *Store`, not an interface that
  only `Store` implements. Declare the interface in the package that consumes it, with only the
  methods that package calls. A sealed interface (an unexported method, or one on an unexported
  type, as in functional options) is fine.
- No `any` where a type fits (`go-rules/any-in-exported-signature`): an exported function returns
  its concrete type or a type parameter, and a parameter it type-switches on becomes a type
  parameter with a constraint, or one function per type. `...any` for fmt- and slog-style
  arguments, a value passed straight to encoding or reflection, and a method an imported interface
  requires (`Scan(src any) error`) are fine.
- Name a package for what it provides (`go-rules/generic-package-name`): never `util`, `utils`,
  `common`, `misc`, `helper`, `helpers` or `interfaces`.
- A getter is named after the value (`go-rules/get-prefixed-getter`): `Owner()`, never
  `GetOwner()`, unless an imported interface requires the Get name.
