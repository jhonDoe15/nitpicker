import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mts';

export const escapeRegExp: (value: string) => string = untypedEscapeRegExp;
