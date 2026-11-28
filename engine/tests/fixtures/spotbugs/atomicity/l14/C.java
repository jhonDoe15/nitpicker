package l14;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  l.lock();
  try {
   x = 1;
  } finally {
   l.unlock();
  }
  x = 3;
 }
 int get() {
  return x;
 }
}
