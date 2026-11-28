package l01;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  l.lock();
  x = 1;
  l.unlock();
  x = 2;
 }
 int get() {
  return x;
 }
}
