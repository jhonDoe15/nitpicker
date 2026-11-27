package m10;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 synchronized void a() {
  w();
 }
 private void w() {
  x = 1;
 }
 void q() {
  Runnable r = this::w;
 }
 int get() {
  return x;
 }
}
