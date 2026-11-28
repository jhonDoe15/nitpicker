package l18;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  while (true) {
   x = 1;
   l.lock();
   if (x > 2) break;
   l.unlock();
  }
 }
 int get() {
  return x;
 }
}
