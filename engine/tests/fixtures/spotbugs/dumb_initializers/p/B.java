package p;
public class B {
    static byte sb = 3; byte ib = 3;
    static int s1 = (sb << 8) | sb;
    int i1 = (ib << 8) + ib;
}
class C { static { int q = (A.q << 8) | A.q; } }
class D { byte ib; int r; { int q = (ib << 8) | ib; if (ib == 200) q++; r = q; } }
class F { byte ib; F() { int q = (ib << 8) | ib; if (ib == 200) q++; } }
class G { byte ib; G() { int q = (ib << 8) | ib; } G(int x) { if (ib == 200) x++; } }
class H { byte ib; void m() { int q = (ib << 8) | ib; } }
