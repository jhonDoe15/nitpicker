package p;
public class A {
  int via(P p) { return p.flag() ? 1 : 2; }
  void ca(P p) { via(p); }
  void cb(P p) { p.z(); }
  void cc(P p) { p.c(); }
}
