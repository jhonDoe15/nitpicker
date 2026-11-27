package l10;
class C {
 java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock();
 int x;
 synchronized void a() {
  w();
 }
 private void w() {
  x = 1;
 }
 int get() {
  return x;
 }
}
