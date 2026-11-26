# React

Part of the [nitpicker-typescript](../SKILL.md) skill. Write these forms from the start; the gate is a backstop.

Applies when `react` is in `package.json`. Every React finding names the allowed form and its
exception route in the message: write that form, don't work around the rule.

- An effect that sets state has a dependency array: `useEffect(() => { setFilter(f); }, [f])`; with no array it
  runs after every render and renders again (`nitpicker/react-effect-needs-dependencies`).
- `useState` and `useRef` take a function or a lazy fill, not a built value: `useState(() => getTimes(range, now))`,
  `useRef<Runner | null>(null)`; a router, store or `QueryClient` is created once, not in the component body
  (`nitpicker/react-no-eager-initial-value`).
- A state update that reads its own state after an `await`, or after an earlier call of the same setter, takes an
  updater: `setItems((current) => [...current, tag])`, not `setItems([...items, tag])`
  (`nitpicker/react-no-stale-state-update`).
- A state updater or reducer only returns the next value: no setter, `dispatch` or prop callback call inside it,
  and no `push`, `sort`, `delete` or assignment on the previous state; compute `next` first, then
  `setItems(next); onChange(next);` (`nitpicker/react-pure-state-updater`).
- `use()` reads a promise that was created outside the render (a prop, a route loader, a `cache`d function),
  never `use(loadUser(id))` with an async function or `use(new Promise(...))`
  (`nitpicker/react-no-uncached-use-promise`).
- Render starts nothing: `navigate(...)`, `router.push(...)`, `document.addEventListener(...)` and
  `document.title = ...` go in a handler or an effect, and a redirect is rendered (`<Navigate to="/login" />`)
  (`nitpicker/react-no-render-side-effect`; timers, `fetch` and `window` listeners: `react-x/purity`).
- In a server-rendered app (Next.js, Remix, Gatsby, Vike, Astro), render the same markup on the server and the
  first client render: never `{typeof window !== 'undefined' && <Wide />}` or
  `useState(() => typeof window !== 'undefined' && window.innerWidth > 600)`; read the browser value with
  `useSyncExternalStore(subscribe, getSnapshot, () => serverValue)` (`nitpicker/react-no-hydration-mismatch`).
- A prop or state array is never sorted, reversed or spliced in place: `players.toSorted(byScore)`, not
  `players.sort(byScore)` (`react-x/immutability`).
- With react-i18next, set `interpolation: { escapeValue: false }` at init (or per call) when `t()` values are
  rendered by React; otherwise `R&D` shows as `R&amp;D` (`nitpicker/react-i18next-escape-value`).
- A component rendered per item gets its DOM ids from `useId()` or from the item, not a literal that a label or
  `aria-*` attribute points at (`nitpicker/react-no-literal-id-in-list-component`).
- A React Query mutation that handles `onSuccess` also handles failure: pass `onError` in the hook or call
  options or show `error` from the mutation (`nitpicker/react-mutation-drops-failure`); a `MutationCache`
  `onError` in the project covers every mutation.
- A `memo` component gets props that stay the same between renders: constants at module level, `useMemo` values and
  `useCallback` functions, not `style={{ ... }}` or `onPick={() => ...}` (`nitpicker/react-no-unstable-memo-props`).
- A `useSelector` or Zustand selector returns a stored value or a primitive; for several values use one call each,
  `createSelector`, `shallowEqual` or `useShallow(...)`, never `(s) => ({ a: s.a, b: s.b })` or `s.items.filter(...)`
  alone (`nitpicker/react-no-unstable-selector-result`).
- `useSyncExternalStore` gets a `subscribe` declared at module level (or in `useCallback`) and a `getSnapshot` that
  returns a value the store keeps, not a new object or array (`nitpicker/react-no-unstable-store-subscribe`).
- An effect that opens a `WebSocket`, `EventSource`, `BroadcastChannel`, worker, observer, `watchPosition` or a
  `requestAnimationFrame` loop returns a cleanup that closes it (`nitpicker/react-no-leaked-effect-resource`).
- An effect that subscribes returns the unsubscribe function as its cleanup:
  `useEffect(() => store.subscribe(onChange), [store, onChange])`, never a bare `store.subscribe(onChange);`
  (`nitpicker/react-no-dropped-effect-handle`).
- Component tests query through `screen` and assert what the user sees (text, roles, focus), never
  component state, instances or hook internals. Keep `fireEvent`, `user` calls and `render` out of
  `waitFor` callbacks, do not wait for a snapshot, and do not use a regex with the `g` flag in a query.
