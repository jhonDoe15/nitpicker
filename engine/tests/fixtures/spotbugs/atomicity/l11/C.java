package l11;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  synchronized (this) {
   x = 1;
  }
  x = 2;
 }
 int get() {
  return x;
 }
}
