package a22;
class C { int x; Object l = new Object(); void set(int v) { x = v; } void other() { synchronized (l) { System.out.println(); } } }
