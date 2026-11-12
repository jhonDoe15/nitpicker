import { addHandler, shout, whisper } from './helpers';

addHandler(whisper);

export const handlers = [shout];
