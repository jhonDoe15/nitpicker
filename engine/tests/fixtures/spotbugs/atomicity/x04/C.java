package x04;
class C { final java.util.concurrent.locks.Lock l = new java.util.concurrent.locks.ReentrantLock(); int x;
void inc() { l.lock (); try { x++; } finally { l.unlock(); } } int get() { return x; } }
