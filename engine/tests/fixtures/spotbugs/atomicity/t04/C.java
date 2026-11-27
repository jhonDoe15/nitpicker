package t04;
class C { 
 java.util.concurrent.CountDownLatch c = new java.util.concurrent.CountDownLatch(1); int x; void set(int v) { x = v; } int get() { return x; } }
