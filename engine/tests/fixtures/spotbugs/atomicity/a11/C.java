package a11;
class C { int x; Object l = new Object(); void dec() { --x; } int get() { synchronized (l) { return x; } } }
