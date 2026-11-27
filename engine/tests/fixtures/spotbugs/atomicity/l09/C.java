package l09;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a(boolean c) {
  if (c) {
   l.lock();
  }
  x = 1;
  l.unlock();
 }
 int get() {
  return x;
 }
}
