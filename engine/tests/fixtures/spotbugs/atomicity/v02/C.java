package v02;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 volatile long x;
 void a() {
  x += 2;
 }
 void s(long v) {
  x = v;
 }
 Object get() {
  return x;
 }
}
