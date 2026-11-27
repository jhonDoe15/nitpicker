package n14;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 int y;
 void a(C o, int v) {
  x = v + (x > 0 ? 1 : 0);
 }
 Object get() {
  return x;
 }
}
