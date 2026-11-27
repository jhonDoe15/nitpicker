package m05;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 synchronized void a() {
  w();
 }
 void w() {
  x = 1;
 }
 int get() {
  return x;
 }
}
