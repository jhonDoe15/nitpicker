package b19;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; void set(int v) { x = v; x = v + 1; } int get() { return x; } }
