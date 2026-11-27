import { of, interval, EMPTY } from 'rxjs';
import { delay } from 'rxjs/operators';
it('x', () => { interval(10).subscribe((v) => expect(v).toBe(0)); });