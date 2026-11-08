# React

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

The React scope turns on when `react` is in the analyzed project's `dependencies` or
`devDependencies` (a peer dependency alone does not count), or when `nitpicker.config.json` sets
`"react": { "enabled": true }`; `"enabled": false` turns it off whatever `package.json` says. A
project without React gets none of the rules below and no change to the rules above. The scope covers
production source under the source roots (every extension the preset lints, `.jsx` included); the test rules at the
end of this list cover test files. Each rule names the allowed form in its message and, where it can flag legitimate code, says
to add an exception for the rule in `nitpicker.config.json`. An exception that names a React rule is skipped while the scope is
off (a PR that adds or removes React keeps linting on both sides); a misspelled rule is still an error.

- **Browser globals by name** (`no-restricted-globals`). Outside a React Native app the scope
  declares the browser globals for source and test files, so the confusing ones (`event`, `name`,
  `status`, `length`, `close`, `open`, `top`, `parent`, `origin` and the rest of the standard
  confusing-browser-globals list) are restricted wherever those globals apply, `domain/` aside:
  `onPick(name)` with no `name` in scope is a missing parameter, not `window.name`. Write
  `window.name` when the global is meant; otherwise take the value as a parameter
  (`onClick={(event) => ...}`) or declare it.
- **Function components only** (`react-x/no-class-component`). Class components are flagged; error
  boundaries, which React only supports as classes, are allowed. The "classes only for `Error`
  subclasses" ban leaves classes that extend `Component` or `PureComponent` to this rule in a React
  project, so each class gets one message.
- **Rules of hooks and exhaustive dependencies** (`react-hooks/rules-of-hooks`,
  `react-hooks/exhaustive-deps`), both as errors. A dependency that is left out on purpose needs an
  exception for `react-hooks/exhaustive-deps`.
- **No derived state in effects** (`nitpicker/react-no-effect-derived-state`). A state setter called
  in the body of a `useEffect` or `useLayoutEffect` callback, whose dependency array is not `[]`, is
  flagged: compute the value during render (`useMemo` when it is costly). Each case has its own
  message: a setter given a fixed value (`setDraft('')`, `[]`, `{}`, `undefined`) on a dependency
  change is a reset, so render the component with that prop as its `key` (`<Form key={userId} />`);
  a setter fed from `localStorage` or `sessionStorage` reads the store during render with
  `useSyncExternalStore`.
  The hooks are resolved through their `react` import (`import { useEffect as onEffect }` and
  `import * as R from 'react'` count; a hook of the same name from another module does not), and
  the setter can be `const [x, setX] = useState()` or `useState()[1]` kept in a variable. A function
  declared in the effect body and called there synchronously counts as the body. Setters called from
  other nested callbacks (a subscription, an event handler, `.then`, after an `await`) are not
  flagged, and neither is `[]` (the mounted-flag pattern) or a function declared outside the effect.
  Subscribing to an external store (`matchMedia`) is better written with `useSyncExternalStore`;
  measuring the DOM in `useLayoutEffect` is the usual legitimate exception.
- **No data fetching or async work in effects** (`nitpicker/react-no-effect-data-fetching`).
  `fetch` (also `window.fetch` and `globalThis.fetch`), `axios`, `ky` and `new XMLHttpRequest`
  in work the effect itself does are flagged: use a data-fetching library (TanStack Query
  `useQuery`, SWR `useSWR`) or the framework (a route loader, a Server Component). Beyond the
  names, async work is flagged when its result flows into state: a state setter (`setX`) called
  after an `await`, inside a `.then` callback or passed to `.then` (`load(id).then(setUser)`). It is
  reported once per effect, at its first async step. The effect's own work is its callback, a
  helper or IIFE declared in it and called by it, and the callbacks it hands to `setTimeout`,
  `setInterval` or `requestAnimationFrame`; a handler the effect only registers
  (`addEventListener('pagehide', ...)`, where a `keepalive` beacon belongs) is not. A promise whose
  result stays out of state is syncing with an external system and passes: an animation
  (`animate(scope.current, ...)`), `void changeLanguage(locale)`, `void ref.current?.play()`. The
  rule needs no type information. The message names the form for each kind of work: data through
  `useQuery` or a route loader, an action (a save, a clipboard write) in the event handler that
  causes it, a redirect by rendering `<Navigate />`.
- **No prop callbacks called from effects** (`nitpicker/react-no-effect-event-handling`). An
  effect that calls a prop callback (`onSave(value)`, `notify(value)`, `props.onChange()`, one
  destructured with `const { onChange } = props`, also renamed as `{ onChange: report }`, or one
  held in a ref, `const latest = useRef(onChange); latest.current(value)`) reacts to a change
  instead of to an event: call the callback in the handler that causes the change. Any prop of a
  component counts, whatever its name; a custom hook's parameters count when named `on*`. An effect with no
  dependency array runs after every render and is reported too. A call inside a nested function (a
  subscription, a timer) and an effect with `[]` are left alone; an effect that synchronizes with
  an external system needs an exception.
- **No array index as `key`** (`react-x/no-array-index-key`): use a stable id from the item. Every
  element rendered from a list has a `key` (`react-x/no-missing-key`) and siblings do not repeat
  one (`react-x/no-duplicate-key`). A `key` built from `Math.random()`, `Date.now()`,
  `new Date()`, `performance.now()`, `crypto.randomUUID()` (also through `window.` or
  `globalThis.`), a generator imported from `uuid`, `nanoid`, `cuid`, `@paralleldrive/cuid2`,
  `ulid` or `short-uuid` under any local name, or `randomUUID` from `node:crypto`, directly, inside
  a template or expression, through a `const` declared in the component
  (`const id = crypto.randomUUID(); key={id}`), or through a helper that returns one (a function in
  the same file, `function makeKey() { return Math.random(); }`, or an exported function of a
  project module the file imports, `genId()` from `../shared/ids`; one level deep), is flagged
  (`nitpicker/react-no-random-key`): it changes on every render and remounts the row.
  `react-x/purity` leaves a call inside a `key` to this rule, and the `Math.random` restriction of
  `no-restricted-properties` is dropped where this rule reports the same call, so it is reported
  once.
- **Pure render, no mutation.** State, props and hook results are not mutated
  (`react-x/immutability`: `setList([...list, item])`, `items.toSorted()`); render does not call
  `Date.now()`, `Math.random()` or storage, read or write refs, or set state
  (`react-x/purity`, `react-x/refs`, `react-x/set-state-in-render`). A lazy `useState(() => ...)`
  initialiser is the place for a one-time read; a ref may be lazily initialised in render
  (`if (ref.current === null) ref.current = new Player()`), but its value is read in handlers and
  effects. These rules come from the React Compiler's
  analysis and can flag legitimate code, so each message names the exception.
- **Components are declared at module level** (`react-x/no-nested-component-definitions`,
  `react-x/static-components`, `react-x/no-nested-lazy-component-declarations`): a component
  declared inside another remounts, and loses its state, on every render. A nested function or
  class is reported by the first rule; `static-components` reports only a component built by a
  call during render (`const Themed = withTheme(Panel)`), so each case gets one message.
- **One form per construct.** `{count && <p />}` renders `0` for a number, so compare
  (`count > 0 && ...`) or use a ternary (`react-x/no-leaked-conditional-rendering`, needs type
  information). A context value, and a default prop, that is an object, array or function literal
  is a new value on every render: hoist it or wrap it in `useMemo`
  (`react-x/no-unstable-context-value`, `react-x/no-unstable-default-props`). `ref` is a plain prop
  and `<Context value={...}>` is the provider (`react-x/no-forward-ref`,
  `react-x/no-context-provider`); both are off when the installed `react` (or, when none is
  installed, the declared range) of the head checkout is older than 19. The major is read once into
  the head policy (`react.major`) and passed to the React plugins as their React version, so a pull
  request that upgrades React to 19 reports no existing `forwardRef` as new.
- **Browser APIs** (`eslint-plugin-react-dom`): no `dangerouslySetInnerHTML` (render JSX; sanitised
  and reviewed HTML needs an exception for `react-dom/no-dangerously-set-innerhtml`), an explicit
  `type` on every `<button>`, `rel="noreferrer noopener"` next to `target="_blank"`, no
  `javascript:` URLs. Effects clean up after themselves (`eslint-plugin-react-web-api`): an
  `addEventListener` is paired with `removeEventListener` of the same named function, and a
  `setInterval`, `setTimeout`, `ResizeObserver` or `IntersectionObserver` is cleared or
  disconnected in the returned cleanup. Fetching in an effect is covered by the data-fetching rule
  above.
- **No direct DOM changes in components** (`nitpicker/react-no-direct-dom`), in files that render
  JSX, files under `ui/`, `shared/` and `lib/` (the helpers UI code imports) and hook files
  (`use*`). `document.getElementById`/`querySelector`/`querySelectorAll` and `getElementsBy*`
  (also through `window.document`, `globalThis.document`, an alias of `window` or `document` in a
  `const` or a `let` that is never reassigned, or an element's `ownerDocument`), assignments to
  `.innerHTML`, `.outerHTML`, `.innerText` or `.textContent`, `insertAdjacentHTML`,
  `insertAdjacentText`, `setHTMLUnsafe`, `createContextualFragment` and `document.write`/`writeln`,
  and `.className`, `.style.*`,
  `style.setProperty`/`removeProperty`, `Object.assign(el.style, ...)` or `classList.add`,
  `remove`, `toggle`, `replace` on anything but a ref (`ref.current`, or a const read from it),
  `document.documentElement` or `document.body` are flagged: state and props drive the DOM.
  `setAttribute`, `removeAttribute` and `toggleAttribute`, and inserting nodes (`append`,
  `appendChild`, `prepend`, `insertBefore`, `replaceChildren`, ...) are flagged on a queried or
  created element and on `document.head`; `documentElement` and `body` may change their attributes,
  and a ref may receive children. Render into another node with `createPortal`. Files under
  `adapters/` are checked even without JSX. The file that mounts the app with `createRoot`,
  `hydrateRoot` or `createPortal` may look up its container. Glue for a third-party widget or a
  file download needs an exception.
- **Form fields** (`nitpicker/react-field-has-label`, `nitpicker/react-controlled-input`). An
  `<input>`, `<textarea>` or `<select>` has a label: wrapped in `<label>` or in a label component
  (any component named `Label` or ending in `Label`: `<FormLabel>`, `<Form.Label>`), an `id` that a
  `<label htmlFor>` or a label component with `htmlFor` (`<Label htmlFor="email">`, `<Form.Label>`)
  in the same file points to (a computed `id` is accepted), `aria-label` or
  `aria-labelledby` (hidden, submit, reset, button and image inputs, and fields with spread props,
  are left alone). A field is either controlled (`value` or `checked` with `onChange`, `readOnly`
  or `disabled`) or uncontrolled (`defaultValue`), never `value` with `defaultValue`; a form library
  that needs otherwise takes an exception.
- **One styling approach** (`nitpicker/react-single-styling-approach`), chosen with
  `react.styling`: `class-names` (`className` with CSS Modules, plain stylesheets or utility
  classes; inline `style` objects and CSS-in-JS libraries are flagged), `css-in-js` (styled-components,
  Emotion, Stitches, goober, Linaria; stylesheet imports and inline `style` objects are flagged) or
  `inline-style` (`style` objects; stylesheet imports and CSS-in-JS libraries are flagged) or
  `style-sheet` (React Native `StyleSheet.create` styles; inline `style` objects of fixed values,
  stylesheet imports and CSS-in-JS libraries are flagged). Unset, the approach is the one most
  source files of the head checkout use: files that import a stylesheet or pass `className`, files
  that import a CSS-in-JS library, files that call `StyleSheet.create` and files with inline
  `style` objects are counted, and the largest group wins (ties in that order). Only with no
  styling in the code yet does `package.json` decide: `css-in-js` when it lists one of those
  libraries, `style-sheet` when it lists `react-native` or `expo`, else `class-names`. The approach
  is resolved once into the head policy (`react.styling`) and both sides are linted with it, so a
  pull request that adds MUI and Emotion does not turn every CSS Modules file into a finding.
  A `style` object is flagged only when all its values are fixed (literals, or arrays and objects
  of literals): a value computed at runtime (`style={{ width: progress }}`,
  `<Animated.View style={{ opacity: fade }} />`, `{ paddingTop: insets.top }`) is the allowed use
  of `style` under every approach, and the message names the form for fixed values (a class with
  `className={styles.title}`, a styled component, or a module-level `StyleSheet.create`). The
  object is checked when it is written inline, bound to a `const` in the same file (also
  `style={styles.box}` and `styles['box']` on a `const styles = { box: {...} }`), or reached
  through `?:`, `&&`, `??`, `satisfies` or `as`; `css=` and `sx=` props, `style` inside spread
  props and a `style` value that is not an object literal (`style={style}`) are not checked. An
  object of only CSS custom properties (`'--progress': percent`) is allowed. This is the default
  because inline `style` objects of fixed values are the usual agent slop.
- **No hard-coded colors** (`nitpicker/react-no-hardcoded-colors`). Every production source file
  of the scope is checked (`.ts` and `.mjs` helpers included; tests and story files,
  `*.stories.*` and `*.story.*`, are not; the story pattern is `storyGlobs` in
  `eslint-config/scope-support.mjs`, shared with the i18n scope). A whole string that is a 6- or
  8-digit hex color (`'#336699'`) or a color function with
  literal arguments (`rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`,
  `oklch()`, `color(display-p3 ...)`) is reported anywhere. A 3- or 4-digit hex (`'#add'`) and a
  named color (`red`, `gray`) are reported only in a color position, so ids, hashes and anchors
  that happen to look like colors are left alone. The color positions are:
  - the value of `color`, `backgroundColor`, `background`, `borderColor`, `fill`, `stroke`,
    `outlineColor`, `textDecorationColor` or `caretColor`, as an object key or as a JSX attribute
    (`<svg fill="red">`). A named color under such a key is reported only in a JSX attribute or in
    a style context, so domain data such as `{ name: 'Tee', color: 'black' }` passes;
  - a style context: the JSX `style`, `sx` and `css` attributes, an object passed to `styled`,
    `css`, `keyframes`, `createGlobalStyle` or `StyleSheet.create`, and an object typed or
    asserted as `CSSProperties` and similar style types. Compound values are checked there
    (`border: '1px solid #ccc'`, `boxShadow: '0 0 4px rgba(0, 0, 0, 0.2)'`);
  - the text of a `styled.x`, `styled(X)`, `css`, `keyframes` or `createGlobalStyle` template
    (comments and `url(#id)` references are ignored), where a named color is reported as the
    whole value of a color property (`color: red;`, `background-color: white !important;`);
  - a CSS declaration in any other string or template, with a color-bearing property name at the
    start or after `;` or `{` (`'border: 1px solid #ccc'`, `'a:1; --brand: #336699'`), so prose
    such as `'Invalid color: #fff is not allowed'` passes, and a Tailwind arbitrary value
    (`bg-[#336699]`, `bg-[rgb(0,0,0)]`).

  Prose that mentions a color function (`'Use rgb(255, 0, 0) format'`), `rgb(var(--brand-rgb))`,
  `transparent`, `currentColor`, `inherit`, `initial` and `unset` are fine. Take the color from the
  theme or palette (a theme token, a CSS variable, `currentColor`). The file or folder that
  defines the palette gets one exception for the rule (`src/theme/**`); there is no filename
  heuristic.

- **One optional input per concept** (`nitpicker/no-singular-and-plural-prop`). Component props
  are one of the inputs this rule checks everywhere; see [Everywhere](everywhere.md).
- **Exclusive props are a type, not a check** (`nitpicker/no-runtime-exclusive-props-check`). An
  `if` in a component body whose condition tests two or more of its own props the same way (`a && b`,
  `!a && !b`, `a !== undefined && b !== undefined`, `a != null && b != null`, only `&&` chains of
  props with nothing else in them) and whose branch rejects, by `throw`, `console.error(...)` or
  `console.warn(...)`, is flagged: make the props a discriminated union
  (`{ icon: Icon; image?: never } | { image: string; icon?: never }`) so the compiler rejects the
  combination. Props are the destructured parameter names or `props.name`. A branch that renders a
  fallback, returns `null`, logs at another level or sets state is not flagged, and neither is a check
  inside a nested function or a hook callback.
- **A story for every component, where Storybook is used** (`component-story-missing`, a check of
  the `structure` analyzer, not an ESLint rule). A package whose nearest `package.json` lists
  `storybook` or an `@storybook/*` package is checked: each source file in it that exports a real
  component (a function returning JSX, a `memo` or `forwardRef` result or a class extending
  `Component` or `PureComponent`; not objects, arrays or tables holding JSX) needs a story. The
  story is `<Name>.stories.<ext>` or `<Name>.story.<ext>` (any code extension, the story pattern
  the i18n scope uses), anywhere under the source roots of the same package (beside the component,
  in a `__stories__` folder or in a top-level `src/stories/` as Storybook's setup creates it), named
  after any component the file exports, after the file, or after the folder for an `index.*` file
  (`Card/index.tsx` with `Card/Card.stories.tsx`). MDX docs pages do not count, because they hold
  no stories. Story files and files under `__stories__` or `stories` are not components. Each
  component of a file without a story is its own finding, located at its declaration, so a second
  component added to a file that has none is a new finding. A finding is enforced when more than half of the checked
  components have a story, and only reported (`descriptive`) otherwise, so a project adopting
  stories is not failed on every old component. That decision, and whether Storybook is present, are
  read from the head checkout on both sides of a comparison, so a pull request that adds Storybook or
  crosses the half mark does not turn untouched components into new findings. An exception lists the
  file; the message carries the exact entry:
  `{"rule":"component-story-missing","paths":["src/Card.tsx"],"reason":"..."}`.
- **TypeScript sources in a TypeScript project** (`javascript-in-typescript-project`, a check of
  the `structure` analyzer). In a project with a `tsconfig.json` (read from the head checkout on
  both sides), every `.js`, `.mjs`, `.cjs` or `.jsx` file under the source and test roots is a
  finding with the file as its identity, so only a file a change adds fails. The message names the
  TypeScript file to write instead (`.mjs` to `.mts`, `.jsx` to `.tsx`) and the exception entry,
  `{"rule":"javascript-in-typescript-project","paths":["src/cli.mjs"],"reason":"..."}`.
  `layout.entryPoints` are skipped, and the JavaScript preset does not run the check.
- **Accessibility** (`jsx-a11y/*`): the recommended `eslint-plugin-jsx-a11y` rule set plus
  `control-has-associated-label` (buttons, links and roles need text or `aria-label`; form fields
  are covered by the field rule above), `anchor-ambiguous-text` (no "click here"),
  `no-aria-hidden-on-focusable` and `prefer-tag-over-role`, as errors. `<label>Name <TextField /></label>`
  counts as a labelled control for any capitalised component.
  `jsx-a11y/mouse-events-have-key-events` is configured beyond the recommended default, which only
  checks `onMouseOver`/`onMouseOut`: `onMouseEnter` also needs `onFocus` and `onMouseLeave` also
  needs `onBlur`, so hover-only cards are caught. Each jsx-a11y message ends with the allowed form
  where one exists (`accessibilityHints` in `eslint-config/react/rules/accessibility-rules.mjs`,
  for example "Give it visible text (`<button>Close</button>`) or `aria-label="Close"`; `title` is
  not a label.") and with the exception route.
- **`null` for refs and contexts.** `null` stays banned, except as the argument and the type
  argument of `useRef` and `createContext` (`useRef<HTMLDivElement>(null)`,
  `createContext<Theme | null>(null)`), where React's types need it.
- `@typescript-eslint/no-misused-promises` stops flagging `async` event handlers in JSX attributes
  (`onClick={async () => ...}`), which is the normal React form. `no-confusing-void-expression`
  stops flagging a shorthand arrow whose contextual type returns `void`
  (`onChange={(event) => setTitle(event.target.value)}`).
- **Component tests** (test files only: the test roots, which default to `test`, `tests`,
  `__tests__` and `e2e` at the repo root, `*.test.*` and `*.spec.*` files under the source roots,
  and `__tests__` directories under them). They need no particular test runner (Vitest or
  Jest), and report in every `.tsx` and `.jsx` test (except Playwright and Cypress component
  tests), in a test that imports `@testing-library/*`, `react`, `react-dom` or another `react-*`
  package, `enzyme`, `react-test-renderer`, or a project `test-utils` module (relative, through a
  tsconfig `paths` alias such as `@/test-utils`, or re-exported by a barrel), in a test that mocks
  `react` or `react-dom` with `vi.mock`/`jest.mock`, and in a test that imports a project helper
  that imports `@testing-library/*`, `enzyme` or `react-test-renderer` (`@/test/render` exporting
  its own `renderApp`, also through a barrel such as `@support`; followed up to four imports deep),
  so Playwright and domain tests in the same roots are left alone. An import of such a helper counts
  as the Testing Library import, so queries on what it returns are checked. Query by accessible
  role, not test ids (`testing-library/no-test-id-queries`) or DOM traversal, class selectors and
  `container` queries (`testing-library/no-node-access`): `screen.getByRole('button', { name: 'Save' })`,
  or `toHaveFocus()` for focus. Query through `screen`, not through queries destructured from
  `render(...)` (`testing-library/prefer-screen-queries`, in Testing Library's own React
  recommendations); `within(element)` scopes a query to part of the page. Drive the component with `userEvent`, not `fireEvent`
  (`testing-library/prefer-user-event`), and `await` every `userEvent` call, `findBy*` query and
  `waitFor` (`testing-library/await-async-events`, `await-async-queries`, `await-async-utils`);
  a project on user-event v13, whose calls are synchronous, needs an exception for
  `await-async-events`. Create the user with `const user = userEvent.setup()`
  (`testing-library/prefer-user-event-setup`, for the default and the named `userEvent`
  import alike). Check presence with `getBy*` and absence with
  `queryBy*` (`testing-library/prefer-presence-queries`). Do not wrap `render` or `user` calls
  in `act` (`testing-library/no-unnecessary-act`), leave `screen.debug()` and other debug
  output in (`testing-library/no-debugging-utils`) or call `cleanup` yourself
  (`testing-library/no-manual-cleanup`, on when the project's Vitest config sets
  `globals: true` or the project has no Vitest; with `globals` unset or false, Testing Library
  cannot register its own cleanup, so the `afterEach(cleanup)` a setup file needs passes). Do not test implementation details
  (`nitpicker/react-test-no-implementation-details`): no `.instance()`, no `.state()` or `.setState()` on
  an enzyme or test-renderer wrapper (a store's `setState` is fine), no test-renderer
  `findByType`/`findByProps`, no React fiber internals (`_reactInternals`,
  `stateNode`, `memoizedState`) and no `spyOn` on a React hook (`vi.spyOn(React, 'useState')`,
  `jest.spyOn(R, 'useEffect')`, `vi.spyOn(require('react'), 'useState')`, with `React` or any
  binding of `react`: a default, namespace, `{ default as R }`, `import = require`, `require`
  (anywhere in the file), `await import('react')` or `vi.importActual('react')` binding, or an
  alias such as `const R = React`), and no `vi.mock('react', ...)` or `jest.mock('react', ...)`
  (nor a `react-dom` mock that replaces a hook); Testing Library's guiding principle is to
  test the way the software is used, so assert what the user sees, or test a custom hook with
  `renderHook`. An element with no role or accessible name needs an exception. A test file that hovers
  (`user.hover`, `userEvent.hover`, `fireEvent.mouseEnter` or `mouseOver`, or a `user.pointer` call
  that only moves to a `target`) must also exercise the keyboard path somewhere in the same file:
  `user.tab()`, `user.keyboard(...)`, `user.type(...)` with a `{Enter}`-style key token, `.focus()`,
  `fireEvent.focus`, `focusIn`, `keyDown`, `keyUp` or `keyPress`, a `press`, `down` or `up` call
  (`locator.press('Enter')`), or any call through a `keyboard` object (`page.keyboard.press('Tab')`).
  `nitpicker/hover-test-needs-keyboard`
  reports the first hover when none appears: add a test that tabs to the element and asserts the
  same state. A hover-only control gets an exception. A project with
  `@testing-library/react-native` keeps `testID` queries, the idiom there.
- **Component test setup.** A Vitest project needs four things before the first component
  test passes: `test.environment: 'jsdom'` (or `happy-dom`) in the Vitest config;
  either `test.globals: true`, so Testing Library registers its `cleanup` after each test, or
  `afterEach(cleanup)` in a setup file (without one of them the second test that renders sees the
  first one's DOM; `testing-library/no-manual-cleanup` follows the project's choice, read into the
  head policy as `react.autoCleanup`);
  `import '@testing-library/jest-dom/vitest'` in a file listed in `test.setupFiles`, for
  `toBeInTheDocument()` and the other DOM matchers; and the named import
  `import { userEvent } from '@testing-library/user-event'`, because the default import has no
  `setup()` under `module: NodeNext`. When a test fails with `document is not defined`,
  `Invalid Chai property: toBeInTheDocument` or `afterEach is not defined`, the `tests-failed`
  message ends with a hint that names the missing setup line
  (`adapters/quality-areas/reporting/failure-lines.mjs`).
- **Snapshot-only tests are allowed.** No rule bans a test whose only assertion is
  `toMatchSnapshot()` or `toMatchInlineSnapshot()`. A snapshot can pin a rendered structure
  deliberately, and there is no general recommendation against it nor a weird pattern with a
  standard alternative. The bans above still apply inside such a test.
- **Use the library's component** (`redefined-library-component`, reported by the `structure`
  check). A component definition (a top-level PascalCase function, or `const` arrow function,
  function expression, `memo` or `forwardRef`, in a `.tsx` or `.jsx` file) whose name is one that
  production files render from a package is reported, for example a second `Card` when `<Card />`
  from `@acme/ui` is rendered in several files. A name counts only when the package is listed in the
  `package.json` of the file (or the project root), so a bundler alias such as `@components/Button`
  is not a package, and only when the project uses it as a JSX element, so a `Request` or an ORM
  `Table` that is never rendered does not. Names come from named imports rendered as a top-level
  element (the imported name, not the local alias) and a default import of a deep path whose last
  segment is the local name (`import Button from '@mui/material/Button'`); a namespace member
  (`<Tabs.List />`) and the icon packages of `scopePackages.icons` (an imported `Search` icon) do
  not count. Relative imports, `tsconfig.json` aliases such as `@/` and `~/`, and type-only imports
  are not packages. A file that imports anything from a package that exports the name, directly or
  through project modules that re-export it (a `../ui` barrel over `@acme/ui`), is not reported: it
  is a wrapper. A workspace package counts as a library, but its own components are not reported
  against it. Use the library's component, compose it under a different name, or rename the new one.
- **Use the icon library** (`new-icon-asset`, reported by the `structure` check). An icon-sized
  `.svg` file (a `viewBox`, or without one a `width` and `height`, of 48 or less in both dimensions;
  logos and illustrations are larger, and a sprite sheet with neither is not an icon) under the
  source roots is reported when `package.json` lists an icon package, one of the names in
  `scopePackages.icons` in `languages/typescript/preset/eslint-config/scope-support.mjs`
  (`lucide-react`, `react-icons`, `@heroicons/react`, `@mui/icons-material`, `@tabler/icons-react`,
  `@phosphor-icons/react`, ...). The framework favicon conventions (`icon.svg`, `favicon.svg`,
  `apple-icon.svg`), names with `logo` or `brand` in them, and generated, test, excluded,
  `__mocks__/`, `__fixtures__/`, `fixtures/` and `stories/` folders are skipped, and the extension
  matches in any case. Both the React scope and the icon package are read once from the head
  checkout and written into the head policy for both sides, like `react.enabled`, so a pull request
  that adopts an icon package does not report every old svg. Existing files are baselined by path. A
  new icon or illustration that is a design decision needs an exception for the file.

## Vite, Next.js and other framework conventions

- **App entry.** The file that mounts the app runs work at import time on purpose. When
  `package.json` lists `vite` (or a `vite.config.*` exists), the module scripts of `index.html`
  (`<script type="module" src="/src/main.tsx">`), else the first of `src/main.tsx`, `src/main.ts`,
  `src/main.jsx` and `src/main.js` that exists, are detected as entry points and the module-load
  rule skips them. List another entry file yourself:
  `"layout": { "entryPoints": ["src/main/main.tsx"] }`. Side-effect imports of stylesheets
  (`import './index.css'`, also `.scss`, `.sass`, `.less`, `.styl`, `.pcss`) are not module-load
  effects.
- **CSS Modules and assets.** `import styles from './panel.module.css'` and image imports need
  types. Add `vite/client` to `types` in `tsconfig.json`, or put
  `/// <reference types="vite/client" />` in a `.d.ts` under `src/` (what `create-vite` generates as
  `vite-env.d.ts`), or declare the module in a `.d.ts`. Hand-written `.d.ts` files under the source
  roots are part of the type-check program, so these declarations take effect.
- **Default exports.** The framework files that need `export default` are detected from the head
  checkout and allowed: with `next` in `package.json` (or a `next.config.*`), the App Router files
  `page`, `layout`, `loading`, `error`, `global-error`, `not-found`, `template`, `default` and
  `route`, `forbidden` and `unauthorized` and the metadata routes `sitemap`, `robots`, `manifest`,
  `icon`, `apple-icon`, `opengraph-image` and `twitter-image` under `app/` or `src/app/`, every
  file under `pages/` or `src/pages/`, and `middleware` or `proxy` (Next 16) at the root or in
  `src/`; with `@react-router/dev`, an `@remix-run/*` package or a `react-router.config.*` file,
  the route modules: `app/root.*`, `app/routes.*`, `app/entry.client.*`, `app/entry.server.*` and
  every file under `app/routes/`; with `@storybook/*` or `storybook` (or a `.storybook/` folder),
  `*.stories.*` and `*.story.*`; with `expo-router`, every file under `app/` or `src/app/`. The
  detected globs and entry points are written into the head policy (`frameworks`) for both sides.
  Other framework files take an exception scoped to those paths:
  `"exceptions": [{ "rule": "nitpicker/no-default-export", "paths": ["src/routes/**"], "reason": "framework file convention" }]`.
  The default-export ban is its own rule, so the exception lifts nothing else for those paths.
- **Lazy components.** The standard `lazy(() => import('./x').then(...))` is a promise chain. Use
  `lazy(async () => ({ default: (await import('./badge.js')).Badge }))`.
- **`null`.** `useRef<HTMLDivElement>(null)` and `createContext<T | null>(null)` are allowed. Anything
  else a library forces is an exception for `nitpicker/no-null` on those paths (promise chains a
  library forces: `nitpicker/no-promise-chain`).

`eslint-plugin-regexp` (MIT) supplies the `regexp/` rules (super-linear backtracking, the `g` and
`y` flags, and dead or redundant pattern parts) in every project, React or not.

The plugins are `eslint-plugin-react-hooks`, `eslint-plugin-react-x`, `eslint-plugin-react-dom` and
`eslint-plugin-react-web-api` (the last three are eslint-react, MIT, pinned to one version),
`eslint-plugin-jsx-a11y-x` and `eslint-plugin-testing-library` (whose peer range includes ESLint 10). `eslint-plugin-react` and `eslint-plugin-jsx-a11y` declare no ESLint 10
support, so their maintained, ESLint 10 compatible counterparts are used.
