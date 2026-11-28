package i.locals;
class B {
    void m() { class L { int k; void n(L o) { this.k = 1; int z = o.k; this.k = 2; } } }
    void p() { Object a = new Object() { int k; void n() { k = 1; } }; }
    void q() { record R(int k) { int g(R r) { return r.k + k; } } }
    void r() { enum E { A; int k; int g(E e) { return e.k; } } }
}
