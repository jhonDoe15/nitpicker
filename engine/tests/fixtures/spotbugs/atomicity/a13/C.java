package a13;
class C { volatile int x; Object l = new Object(); void set(int v) { x = v; } void inc() { x++; } int get() { synchronized (l) { return x; } } }
