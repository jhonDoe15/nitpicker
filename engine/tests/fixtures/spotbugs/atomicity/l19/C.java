package l19;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 void a() {
  Object o = new Object();
  synchronized (o) {
   x = 1;
  }
 }
 int get() {
  return x;
 }
}
