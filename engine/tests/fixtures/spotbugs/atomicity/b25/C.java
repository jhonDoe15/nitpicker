package b25;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 long x; synchronized void set(long v) { x = v; } long get() { return x; } }
