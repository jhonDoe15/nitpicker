import { retry, handleAll } from 'cockatiel';
export const policy = retry(handleAll(), {});
