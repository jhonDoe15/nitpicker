import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mjs';

export const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
