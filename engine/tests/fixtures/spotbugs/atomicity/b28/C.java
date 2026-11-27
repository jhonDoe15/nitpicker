package b28;
class C { java.util.concurrent.atomic.AtomicBoolean b = new java.util.concurrent.atomic.AtomicBoolean();
 int x; java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock(); void set(int v) { l.lock(); try { x = v; } finally { l.unlock(); } } int get() { return x; } }
