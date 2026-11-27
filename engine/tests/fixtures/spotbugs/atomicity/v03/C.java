package v03;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 volatile int x;
 int a() {
  return x++;
 }
 Object get() {
  return x;
 }
}
