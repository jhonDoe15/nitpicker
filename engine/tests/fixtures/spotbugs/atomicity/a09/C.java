package a09;
class C { int x; Object l = new Object(); void inc() { x++; } int get() { synchronized (l) { return x; } } }
