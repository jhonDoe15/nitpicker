package b10;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; synchronized void set(int v) { x = v; } int get() { return x; } }
