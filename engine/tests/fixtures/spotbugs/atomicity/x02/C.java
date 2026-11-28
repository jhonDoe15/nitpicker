package x02;
class C { int cnt; private void f(int a) { cnt++; } private void f(String s) { cnt++; } synchronized void g() { f(1); f("a"); } int get() { return cnt; } }
