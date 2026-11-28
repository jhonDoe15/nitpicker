package a17;
class C extends Thread { int x; void set(int v) { x = v; } public void run() { System.out.println(x); } }
