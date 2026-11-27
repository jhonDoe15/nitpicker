package m09;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 synchronized void a() {
  w();
 }
 private static void w() {
  C c = new C();
  c.x = 1;
 }
 int get() {
  return x;
 }
}
