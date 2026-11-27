package m11;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 synchronized void a() {
  w();
 }
 private void w() {
  x = 1;
 }
 private void u() {
  w();
 }
 int get() {
  return x;
 }
}
