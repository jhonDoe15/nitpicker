package x03;
class C { int cnt; private void f(int a) { cnt++; } private void f(String s) { cnt++; } synchronized void g() { f(1); } void h() { f("a"); } int get() { return cnt; } }
