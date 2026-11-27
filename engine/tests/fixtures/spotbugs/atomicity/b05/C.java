package b05;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 long x; void inc(long v) { x += v; } long get() { return x; } }
