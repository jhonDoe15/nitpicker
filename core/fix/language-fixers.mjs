import { fixJvm } from '../../languages/java/fix/jvm-fix.mjs';
import { fixPython } from '../../languages/python/fix/python-fix.mjs';

export const languageFixers = {
  python: fixPython,
  java: fixJvm,
  kotlin: fixJvm,
};
