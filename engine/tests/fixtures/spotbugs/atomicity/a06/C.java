package a06;
class C { int x; java.util.concurrent.locks.ReentrantLock l = new java.util.concurrent.locks.ReentrantLock(); void set(int v) { x = v; } int get() { return x; } }
