package a12;
class C { int x; Object l = new Object(); int dec() { return --x; } int get() { synchronized (l) { return x; } } }
