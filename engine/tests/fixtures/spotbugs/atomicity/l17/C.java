package l17;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  for (int i = 0; i < 3; i++) {
   l.lock();
   x = i;
   l.unlock();
  }
 }
 int get() {
  return x;
 }
}
