package k16;
class C {
 void s(java.util.concurrent.locks.ReentrantReadWriteLock l) { l.readLock(); }
 int x;
 void a() {
  x = 1;
 }
 int get() {
  return x;
 }
}
