package v05;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 volatile int x;
 void a(int v) {
  x = x + v;
 }
 Object get() {
  return x;
 }
}
