package l20;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a(java.util.concurrent.locks.Lock m) {
  m.lock();
  x = 1;
  m.unlock();
 }
 int get() {
  return x;
 }
}
