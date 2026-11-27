package l16;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 int get2() {
  l.lock();
  try {
   return x;
  } finally {
   l.unlock();
  }
 }
 void a() {
  x = 1;
 }

}
