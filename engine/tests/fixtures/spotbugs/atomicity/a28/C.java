package a28;
class C { int x; Object l = new Object(); void set(int v) { x = v; } int get() { synchronized (l) { return 0; } } int read() { return x; } }
