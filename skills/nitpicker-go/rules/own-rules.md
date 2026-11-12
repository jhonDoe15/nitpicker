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
