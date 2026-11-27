package a18;
class C implements Runnable { int x; void set(int v) { x = v; } public void run() { System.out.println(x); } }
