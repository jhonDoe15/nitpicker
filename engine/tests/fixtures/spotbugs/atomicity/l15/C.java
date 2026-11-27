package l15;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a(java.util.concurrent.locks.ReentrantReadWriteLock rw) {
  rw.writeLock().lock();
  x = 1;
  rw.writeLock().unlock();
 }
 int get() {
  return x;
 }
}
