import { of, interval, EMPTY } from 'rxjs';
import { delay } from 'rxjs/operators';
it('x', () => { source$.pipe(delay(5)).subscribe((v) => expect(v).toBe(1)); });