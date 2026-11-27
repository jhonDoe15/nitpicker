package t12;
class C { 
 java.util.concurrent.Semaphore s = new java.util.concurrent.Semaphore(1); int x; void set(int v) { x = v; } int get() { return x; } }
