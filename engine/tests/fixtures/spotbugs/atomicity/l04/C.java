package l04;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  if (l.tryLock()) {
   x = 1;
   l.unlock();
  }
 }
 int get() {
  return x;
 }
}
