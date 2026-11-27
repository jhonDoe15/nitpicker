package a21;
class C { int x; Object l = new Object(); private void set(int v) { x = v; } void pub(int v) { set(v); } int get() { synchronized (l) { return x; } } }
