package l05;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() throws InterruptedException {
  l.lockInterruptibly();
  x = 1;
  l.unlock();
 }
 int get() {
  return x;
 }
}
