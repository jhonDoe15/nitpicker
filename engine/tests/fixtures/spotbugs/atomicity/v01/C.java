package v01;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 volatile int x;
 void a() {
  x++;
 }
 void s(int v) {
  x = v;
 }
 Object get() {
  return x;
 }
}
