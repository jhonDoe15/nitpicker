package m12;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 private void w() {
  x = 1;
 }
 synchronized void a() {
  w();
 }
 int get() {
  return x;
 }
}
