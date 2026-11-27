package m08;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 java.util.concurrent.locks.Lock l;
 void a() {
  l.lock();
  w();
  l.unlock();
 }
 private void w() {
  x = 1;
 }
 int get() {
  return x;
 }
}
