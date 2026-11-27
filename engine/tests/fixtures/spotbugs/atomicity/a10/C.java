package a10;
class C { long x; Object l = new Object(); void inc() { x += 2; } int get() { synchronized (l) { return (int) x; } } }
