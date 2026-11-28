package l22;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  l.lock();
  l.lock();
  x = 1;
  l.unlock();
  x = 2;
  l.unlock();
 }
 int get() {
  return x;
 }
}
