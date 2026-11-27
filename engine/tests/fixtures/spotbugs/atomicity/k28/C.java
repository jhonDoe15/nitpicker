package k28;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 synchronized int get() {
  return x;
 }
 void a() {
  x = 1;
 }
 int get2() {
  return x;
 }
}
