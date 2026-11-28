package l03;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  l.lock();
  x = 1;
 }
 int get() {
  return x;
 }
}
