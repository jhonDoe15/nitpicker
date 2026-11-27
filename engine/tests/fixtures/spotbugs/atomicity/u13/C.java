package u13;
class C {
 java.util.concurrent.atomic.AtomicBoolean b;
 int x;
 int y; byte[] ba; char[] ca; Object obj; long[] la;
 int foo(Object q) { return 0; }
 void a(C o, int v) {
  synchronized (this) {
   v = x;
  }
  x = v + 1;
 }
 Object get() {
  return x;
 }
}
