package t23;
class C { 
 java.util.concurrent.locks.StampedLock l = new java.util.concurrent.locks.StampedLock(); int x; void set(int v) { x = v; } int get() { return x; } }
