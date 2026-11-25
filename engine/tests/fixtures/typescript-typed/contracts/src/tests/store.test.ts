import { MemoryStore } from '../ports';
import { SystemClock } from '../clock';

new MemoryStore().remove('x');
void new SystemClock().sleep(1);
new SystemClock().stop();
