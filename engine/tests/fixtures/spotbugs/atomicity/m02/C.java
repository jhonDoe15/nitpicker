package m02;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 java.util.concurrent.locks.Lock l, k;
 void a() {
  l.lock();
  x = 1;
  k.unlock();
  x = 2;
 }
 int get() {
  return x;
 }
}
