package p;
public enum E4 {
  A(1);
  public int x; private int y;
  E4(int x) { this.x = x; }
  public void a(int p) { y = p; }
  public void b(int p) { this.y = p; }
  public void c(E4 o) { x = o.x; }
  public void d(int p) { E4 self = this; self.x = p; }
  public void e(int p) { E4 self = A; self.y = p; }
  public void f(int p) { new Object() { void g() { x = p; } }; }
  public void g(int p) { Runnable r = () -> x = p; }
  public <T> void h(T p) { x = (Integer) (Object) p; }
  public void i(int p) { x = p; x = p; y = p; }
  public void j(int p) { assert p > 0; x = p; }
  public void k(int p) { return; }
  public void l(boolean p) { x = p ? 1 : 0; }
  public void m(int p) { int q = p > 0 ? p : 0; y = q; }
  public void n(int p) { int q = p; q++; y = q; }
  public void o(int p) { int q = p; { int r = q; y = r; } }
  public void p(int p) { lbl: y = p; }
  public void q(int p) { ; y = p; }
  public void r(int p) { int q; q = p; y = q; }
  public void s(int p) { int q; q = p; y = q; }
  public void t(int p) { y = (int) (long) p; }
  public void u(int p) { y = (p); }
  public void v(int p) { int q = p; int q2 = q; q = 1; y = q2; }
}
