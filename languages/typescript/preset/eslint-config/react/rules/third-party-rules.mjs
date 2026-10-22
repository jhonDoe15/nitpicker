export const reactXHints = {
  'no-class-component': ` Write a function component with hooks (\`useState\`, \`useEffect\`); an error boundary stays a class.`,
  'no-array-index-key': ` Use a stable id from the item (\`key={todo.id}\`). An exception fits only for a static list that never changes order.`,
  immutability: ` Copy instead: \`setList([...list, item])\`, \`items.toSorted()\`.`,
  purity: ` Pass the value in as a prop or state, or read it in an event handler or an effect.`,
  'set-state-in-render': ` Compute the value during render, or set state in an event handler or an effect.`,
  refs: ` Read and write \`ref.current\` in event handlers and effects (render may only run the lazy init \`if (ref.current === null) ref.current = new X()\`); keep what renders in state.`,
  'no-nested-component-definitions': ` Declare the component at module level and pass data as props.`,
  'static-components': ` Create it once at module level, e.g. \`const ThemedPanel = withTheme(Panel)\` outside the component.`,
  'no-nested-lazy-component-declarations': ` Declare \`lazy(...)\` at module level.`,
  'no-missing-key': ` Add \`key={item.id}\`, a stable id from the item.`,
  'no-duplicate-key': ` Give every sibling a distinct stable id.`,
  'no-leaked-conditional-rendering': ` Compare explicitly (\`count > 0 && <Badge />\`) or use a ternary.`,
  'no-unstable-context-value': ` Wrap the value in \`useMemo\` or hoist it.`,
  'no-unstable-default-props': ` Hoist the default to a module-level constant.`,
  'no-forward-ref': ` Take \`ref\` as a prop.`,
  'no-context-provider': ` Render \`<Context value={...}>\`.`,
};

export const reactDomHints = {
  'no-dangerously-set-innerhtml': ` Render the content as JSX. An exception fits only for sanitised, reviewed HTML.`,
  'no-missing-button-type': ` Add \`type="button"\` (or \`"submit"\` for a form's submit button).`,
  'no-unsafe-target-blank': ` Add \`rel="noreferrer noopener"\`.`,
  'no-script-url': ` Use a real URL, or a \`<button onClick>\`.`,
};

const CLEANUP = 'Return a cleanup from the effect';

export const reactWebApiHints = {
  'no-leaked-event-listener': ` ${CLEANUP} that calls \`removeEventListener\` with the same named function.`,
  'no-leaked-interval': ` Keep the id and \`return () => { clearInterval(id); }\` from the effect.`,
  'no-leaked-timeout': ` Keep the id and \`return () => { clearTimeout(id); }\` from the effect.`,
  'no-leaked-resize-observer': ` ${CLEANUP} that calls \`observer.disconnect()\`.`,
  'no-leaked-intersection-observer': ` ${CLEANUP} that calls \`observer.disconnect()\`.`,
};

export const typedReactXRules = ['no-leaked-conditional-rendering'];

export const react19RuleIds = ['react-x/no-forward-ref', 'react-x/no-context-provider'];

function ids(prefix, hints) {
  return Object.keys(hints).map((name) => `${prefix}/${name}`);
}

export const thirdPartyReactRuleIds = [
  ...ids('react-x', reactXHints),
  ...ids('react-dom', reactDomHints),
  ...ids('react-web-api', reactWebApiHints),
];
