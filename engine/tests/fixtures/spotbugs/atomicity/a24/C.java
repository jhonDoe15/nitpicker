package a24;
class C { int x; void set(int v) { x = v; } int get() { return x; } void t() { new Thread(() -> System.out.println(x)).start(); } }
