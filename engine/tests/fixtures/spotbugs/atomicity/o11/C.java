package o11;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; void set(int v) { int y = x; x = v + y; } int get() { return x; } }
