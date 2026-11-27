package m16;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 void w() {
  x = 1;
 }
 synchronized void a() {
  get();
 }
 private int get() {
  return x;
 }
}
