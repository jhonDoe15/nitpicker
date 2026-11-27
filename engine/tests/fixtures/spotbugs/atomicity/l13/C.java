package l13;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  l.lock();
  l.unlock();
  x = 1;
 }
 int get() {
  return x;
 }
}
