package a08;
class C { long x; Object l = new Object(); void set(long v) { x = v; } int get() { synchronized (l) { return (int) x; } } }
