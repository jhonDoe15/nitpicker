import { fixGo } from '../../languages/go/fix/go-fix.mts';
import { fixJvm } from '../../languages/java/fix/jvm-fix.mjs';
import { fixPython } from '../../languages/python/fix/python-fix.mts';
import type { NitpickerConfig } from '../../shared/values/config-types.mts';
import { isPlainObject } from '../../shared/values/readers.mts';
import type { FixOutcome, FixSettings } from './typed/fix-types.mts';

function pythonFixer(settings: FixSettings): FixOutcome {
  const config: NitpickerConfig = isPlainObject(settings.config) ? settings.config : {};
  return fixPython({
    ...settings,
    config,
    headPolicy: isPlainObject(settings.headPolicy) ? settings.headPolicy : {},
  });
}

export const languageFixers = {
  python: pythonFixer,
  java: fixJvm,
  kotlin: fixJvm,
  go: fixGo,
};
