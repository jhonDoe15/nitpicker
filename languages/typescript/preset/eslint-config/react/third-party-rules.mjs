import { EXCEPTION_HINT, GENERAL_HINT } from './hints.mjs';

const REACT_19 = `On React 18, ${EXCEPTION_HINT}`;

export const reactXHints = {
  immutability: ` Copy instead: \`setList([...list, item])\`, \`items.toSorted()\`.${GENERAL_HINT}`,
  purity: ` Pass the value in as a prop or state, or read it in an event handler or an effect.${GENERAL_HINT}`,
  'set-state-in-render': ` Compute the value during render, or set state in an event handler or an effect.${GENERAL_HINT}`,
  refs: ` Read and write \`ref.current\` in event handlers and effects; keep what renders in state.${GENERAL_HINT}`,
  'no-nested-component-definitions': ` Declare the component at module level and pass data as props.${GENERAL_HINT}`,
  'static-components': ` Create it once at module level, e.g. \`const ThemedPanel = withTheme(Panel)\` outside the component.${GENERAL_HINT}`,
  'no-nested-lazy-component-declarations': ` Declare \`lazy(...)\` at module level.${GENERAL_HINT}`,
  'no-missing-key': ` Add \`key={item.id}\`, a stable id from the item.${GENERAL_HINT}`,
  'no-duplicate-key': ` Give every sibling a distinct stable id.${GENERAL_HINT}`,
  'no-leaked-conditional-rendering': ` Compare explicitly (\`count > 0 && <Badge />\`) or use a ternary.${GENERAL_HINT}`,
  'no-unstable-context-value': ` Wrap the value in \`useMemo\` or hoist it.${GENERAL_HINT}`,
  'no-unstable-default-props': ` Hoist the default to a module-level constant.${GENERAL_HINT}`,
  'no-forward-ref': ` Take \`ref\` as a prop. ${REACT_19}`,
  'no-context-provider': ` Render \`<Context value={...}>\`. ${REACT_19}`,
};

export const reactDomHints = {
  'no-dangerously-set-innerhtml': ` Render the content as JSX. For sanitised, reviewed HTML, ${EXCEPTION_HINT}`,
  'no-missing-button-type': ` Add \`type="button"\` (or \`"submit"\` for a form's submit button).${GENERAL_HINT}`,
  'no-unsafe-target-blank': ` Add \`rel="noreferrer noopener"\`.${GENERAL_HINT}`,
  'no-script-url': ` Use a real URL, or a \`<button onClick>\`.${GENERAL_HINT}`,
};

const CLEANUP = 'Return a cleanup from the effect';

export const reactWebApiHints = {
  'no-leaked-event-listener': ` ${CLEANUP} that calls \`removeEventListener\` with the same named function.${GENERAL_HINT}`,
  'no-leaked-interval': ` Keep the id and \`return () => { clearInterval(id); }\` from the effect.${GENERAL_HINT}`,
  'no-leaked-timeout': ` Keep the id and \`return () => { clearTimeout(id); }\` from the effect.${GENERAL_HINT}`,
  'no-leaked-resize-observer': ` ${CLEANUP} that calls \`observer.disconnect()\`.${GENERAL_HINT}`,
  'no-leaked-intersection-observer': ` ${CLEANUP} that calls \`observer.disconnect()\`.${GENERAL_HINT}`,
};

export const typedReactXRules = ['no-leaked-conditional-rendering'];

function ids(prefix, hints) {
  return Object.keys(hints).map((name) => `${prefix}/${name}`);
}

export const thirdPartyReactRuleIds = [
  ...ids('react-x', reactXHints),
  ...ids('react-dom', reactDomHints),
  ...ids('react-web-api', reactWebApiHints),
];
