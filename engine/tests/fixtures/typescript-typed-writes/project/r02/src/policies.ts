import { retry, handleAll, CircuitBreakerPolicy } from 'cockatiel';
export const policy = retry(handleAll(), {});
declare const guard: CircuitBreakerPolicy;
export const breaker = guard;
