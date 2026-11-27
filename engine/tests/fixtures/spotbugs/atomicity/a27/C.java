package a27;
class C { final int[] a = new int[2]; Object l = new Object(); void set(int v) { a[0] = v; } int get() { synchronized (l) { return a[0]; } } }
