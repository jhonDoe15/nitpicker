package a14;
class C { int x; Object l = new Object(); C(int v) { x = v; } int get() { synchronized (l) { return x; } } }
