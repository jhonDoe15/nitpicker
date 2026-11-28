package k27;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 volatile long x;
 void a(long v) {
  x = v;
 }
 long get() {
  return x;
 }
}
