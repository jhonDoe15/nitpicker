package m03;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 synchronized void a() {
  w();
 }
 void z() {
  w();
 }
 private void w() {
  x = 1;
 }
 int get() {
  return x;
 }
}
