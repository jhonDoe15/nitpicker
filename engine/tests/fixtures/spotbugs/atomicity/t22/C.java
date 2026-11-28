package t22;
class C { 
 java.util.concurrent.BlockingQueue<String> q = new java.util.concurrent.LinkedBlockingQueue<>(); int x; void set(int v) { x = v; } int get() { return x; } }
