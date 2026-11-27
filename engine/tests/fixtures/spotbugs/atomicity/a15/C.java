package a15;
class C { int x; Object l = new Object(); void set(int v) { synchronized (l) { x = v; } } int get() { return x; } }
