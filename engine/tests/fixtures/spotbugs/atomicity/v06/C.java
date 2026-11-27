package v06;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 volatile boolean x;
 void a() {
  x = !x;
 }
 Object get() {
  return x;
 }
}
