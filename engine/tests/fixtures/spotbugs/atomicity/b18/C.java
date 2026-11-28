package b18;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; private void set(int v) { x = v; } int get() { set(2); return x; } }
