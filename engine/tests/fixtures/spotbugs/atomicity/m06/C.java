package m06;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 synchronized void a() {
  w();
 }
 private void w() {
  v();
 }
 private void v() {
  x = 1;
 }
 int get() {
  return x;
 }
}
