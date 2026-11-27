package b11;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; void set(int v) { x = v; } synchronized int get() { return x; } }
