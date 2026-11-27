package m15;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 synchronized void a() {
  w();
 }
 private void w() {
  x = 1;
 }
 private int get() {
  return x;
 }
 void h() {
  get();
 }
}
