package i.inherited;
interface K { int c = 3; }
class C {
    int f;
    void o() { int c = 1; enum En implements K { E1; int h() { return c; } } c = 2; }
    void p() { int c = 1; record R() implements K { int h() { return c; } } c = 2; }
    void q() { int c = 1; interface J extends K { default int h() { return c; } } c = 2; }
    void r() { int c = 1; Object x = new K() { int h() { return c; } }; c = 2; }
    void s() { int x = 1; (x) = 2; ((x)) = 3; (this.f) = 4; (x)++; }
}
