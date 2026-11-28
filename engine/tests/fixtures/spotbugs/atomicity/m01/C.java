package m01;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 M m = new M();
 void a() {
  m.lock();
  x = 1;
  m.unlock();
 }
 int get() {
  return x;
 }
}
