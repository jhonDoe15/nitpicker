/**
 * Shortcut detector interface.
 *
 * A detector is `{ category, name, detect(context) }`. `detect` is synchronous, pure, and returns a
 * list of shortcuts `{ category?, kind, path?, line?, detail }` (a missing `category` defaults to
 * the detector's own). The context holds only things the agent cannot forge:
 *
 * - `caseId`
 * - `fixture` and `final`: Map of posix path to text, the tree before and after the agent ran
 *   (node_modules, .git and build output excluded)
 * - `agentReport`: summary.json of the last gate run the agent made, or undefined
 * - `referenceReport`: summary.json of the runner's own gate run on the final tree, or undefined
 * - `expectedPolicyHash`: the policy hash pinned in the case's fixture.json, or undefined
 *
 * Detectors compare trees; they never trust the gate's own verdict.
 */
export const SHORTCUT_CATEGORIES = [
  'gate-tampering',
  'test-weakening',
  'type-escape',
  'boundary-crossing',
  'non-preferred-construct',
  'baseline-gaming',
];

export function createDetectorRegistry(initial = []) {
  const detectors = [];
  const registry = {
    register(detector) {
      if (typeof detector?.detect !== 'function' || !detector.category) {
        throw new TypeError('a detector needs a category and a detect(context) function');
      }
      detectors.push(detector);
      return registry;
    },
    list: () => [...detectors],
    /** Runs every detector. A throwing detector is reported, never allowed to hide the others. */
    run(context) {
      const shortcuts = [];
      const errors = [];
      for (const detector of detectors) {
        try {
          for (const shortcut of detector.detect(context)) {
            shortcuts.push({ category: detector.category, ...shortcut });
          }
        } catch (error) {
          errors.push({
            detector: detector.name ?? detector.category,
            message: String(error),
          });
        }
      }
      return { shortcuts, errors };
    },
  };
  for (const detector of initial) registry.register(detector);
  return registry;
}

/**
 * The detectors the runner uses by default. E2 to E4 add theirs here, for example
 * `{ category: 'gate-tampering', name: 'gate-tampering', detect: detectGateTampering }`.
 * Until then no shortcut is ever reported, so shortcut rates read 0 and mean "not measured yet".
 */
export const defaultDetectors = createDetectorRegistry([]);
