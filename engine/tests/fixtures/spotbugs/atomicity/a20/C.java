package a20;
class C { String s; Object l = new Object(); void set(String v) { s = v; } String get() { synchronized (l) { return s; } } }
