package b27;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; void inc(int v) { synchronized (this) { x += v; } } int get() { return x; } }
