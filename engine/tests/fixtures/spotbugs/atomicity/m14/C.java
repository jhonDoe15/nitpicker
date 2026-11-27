package m14;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 void a() {
  synchronized (this) {
  }
  w();
 }
 private void w() {
  x = 1;
 }
 int get() {
  return x;
 }
}
