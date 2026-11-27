package k17;
class C {
 void s(java.util.concurrent.locks.ReentrantReadWriteLock l) { java.util.concurrent.locks.Lock r = l.readLock(); }
 int x;
 void a() {
  x = 1;
 }
 int get() {
  return x;
 }
}
