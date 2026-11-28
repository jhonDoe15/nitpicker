package a16;
class C { static int x; Object l = new Object(); static void set(int v) { x = v; } int get() { synchronized (l) { return x; } } }
