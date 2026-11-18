import { callUntyped } from '../../typed/java-values.mts';
import { fieldOf, optionalText, textOf, textsOf } from '../../../../../shared/values/readers.mts';
import { layerPmdRulesets as untypedLayerPmdRulesets } from '../pmd-layers.mjs';

type PmdLayers = {
  readonly tests: string | undefined;
  readonly main: string | undefined;
  readonly nitpicker: string;
  readonly project: string | undefined;
  readonly replaced: string[];
};

export function layerPmdRulesets(input: {
  readonly nitpickerPath: string;
  readonly nitpickerText: string;
  readonly testText: string;
  readonly mainPath: string;
  readonly mainText: string;
  readonly projectText?: string | undefined;
  readonly projectWins?: false;
  readonly assertionHelpers?: string[];
}): PmdLayers {
  const layers = callUntyped(untypedLayerPmdRulesets, input);
  return {
    tests: optionalText(fieldOf(layers, 'tests')),
    main: optionalText(fieldOf(layers, 'main')),
    nitpicker: textOf(fieldOf(layers, 'nitpicker')),
    project: optionalText(fieldOf(layers, 'project')),
    replaced: textsOf(fieldOf(layers, 'replaced')),
  };
}
