package a25;
class C { double x; Object l = new Object(); void set(double v) { x = v; } double get() { synchronized (l) { return x; } } }
