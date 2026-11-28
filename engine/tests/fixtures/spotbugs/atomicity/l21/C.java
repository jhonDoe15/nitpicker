package l21;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  java.util.concurrent.locks.LockSupport.park();
  x = 1;
 }
 int get() {
  return x;
 }
}
