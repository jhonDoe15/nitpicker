package r35;
class C {
 int x;
 void s(java.util.concurrent.locks.ReentrantReadWriteLock l) {
  l.readLock().lock();
 }
 void a() {
  x = 1;
 }
 int get() {
  return x;
 }
}
