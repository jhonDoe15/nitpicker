import { detectShortcuts } from '../detectors/index.mts';
import { type Preset } from '../lib/presets.mts';

export type Trees = ReadonlyMap<string, string>;

export type DetectorContext = {
  readonly caseId: string;
  readonly fixture: Trees;
  readonly final: Trees;
  readonly agentReport?: unknown;
  readonly referenceReport?: unknown;
  readonly expectedPolicyHash?: unknown;
  readonly reference?: Trees | undefined;
  readonly preset?: Preset;
};

export type Shortcut = {
  readonly category?: string | undefined;
  readonly kind: string;
  readonly path?: string;
  readonly line?: number;
  readonly detail?: string;
};

export type Detector = {
  readonly category?: string;
  readonly name?: string;
  readonly detect: (context: DetectorContext) => readonly Shortcut[];
};

type DetectorError = { readonly detector: string | undefined; readonly message: string };

type DetectorRegistry = {
  readonly register: (detector: Detector) => DetectorRegistry;
  readonly list: () => Detector[];
  readonly run: (context: DetectorContext) => {
    readonly shortcuts: Shortcut[];
    readonly errors: DetectorError[];
  };
};

export const SHORTCUT_CATEGORIES = [
  'gate-tampering',
  'test-weakening',
  'type-escape',
  'boundary-crossing',
  'non-preferred-construct',
  'baseline-gaming',
  'legacy-rewrite',
];

const CATEGORY_OF_DETECTOR = new Map([
  ['gate-tampering', 'gate-tampering'],
  ['weakened-tests', 'test-weakening'],
  ['legacy-rewrite', 'legacy-rewrite'],
]);

const CATEGORY_OF_KIND = new Map([
  ['baseline-gaming', 'baseline-gaming'],
  ['any', 'type-escape'],
  ['type-assertion', 'type-escape'],
  ['non-null-assertion', 'type-escape'],
  ['cross-feature-import', 'boundary-crossing'],
  ['shared-entry-branch', 'boundary-crossing'],
  ['ignored-error', 'non-preferred-construct'],
  ['broad-catch', 'non-preferred-construct'],
  ['non-preferred-construct', 'non-preferred-construct'],
]);

export function shortcutCategory({
  category,
  kind,
}: {
  readonly category: string;
  readonly kind: string;
}): string {
  return CATEGORY_OF_KIND.get(kind) ?? CATEGORY_OF_DETECTOR.get(category) ?? category;
}

function runIsolatingDetectorFailures(detectors: readonly Detector[], context: DetectorContext) {
  const shortcuts: Shortcut[] = [];
  const errors: DetectorError[] = [];
  for (const detector of detectors) {
    try {
      for (const shortcut of detector.detect(context)) {
        shortcuts.push({ category: detector.category, ...shortcut });
      }
    } catch (error) {
      errors.push({ detector: detector.name ?? detector.category, message: String(error) });
    }
  }
  return { shortcuts, errors };
}

export function createDetectorRegistry(initial: readonly Detector[] = []): DetectorRegistry {
  const detectors: Detector[] = [];
  const registry: DetectorRegistry = {
    register(detector) {
      if (typeof detector.detect !== 'function' || !(detector.category || detector.name)) {
        throw new TypeError('a detector needs a name or category and a detect(context) function');
      }
      detectors.push(detector);
      return registry;
    },
    list: () => [...detectors],
    run: (context) => runIsolatingDetectorFailures(detectors, context),
  };
  for (const detector of initial) registry.register(detector);
  return registry;
}

export const defaultDetectors = createDetectorRegistry([
  { name: 'shortcuts', detect: detectShortcuts },
]);
