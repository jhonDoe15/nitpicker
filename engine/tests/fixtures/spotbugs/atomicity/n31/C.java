package n31;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 double x;
 int y;
 void a(C o, int v) {
  x = Math.max(x, 1) + 1;
 }
 Object get() {
  return x;
 }
}
