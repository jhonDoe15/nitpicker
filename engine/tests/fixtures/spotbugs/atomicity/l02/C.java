package l02;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  x = 2;
  l.lock();
  x = 1;
  l.unlock();
 }
 int get() {
  return x;
 }
}
