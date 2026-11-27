package a03;
class C { int x; Object l = new Object(); void set(int v) { x = v; } int get() { synchronized (l) { return x; } } }
