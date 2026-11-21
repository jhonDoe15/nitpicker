package p;
public class T {
    public interface I0 { int get(); }
    public static class Mut implements I0 { int v; public int get() { return v; } public void setV(int x) { v = x; } }
    public static class Mut2 implements I0 { int v; public int get() { return v; } public void setW(int x) { v = x; } }
    public static final class Imm implements I0 { public int get() { return 1; } }
    static Mut make() { return new Mut(); }
    static I0 makeI() { return new Mut(); }
    private final I0 e1 = new Mut(); private I0 e2; private I0 e3; private I0 e4; private I0 e5; private I0 e6; private I0 e8; private I0 e9; private I0 e10; I0 e11; private I0 e12; private static I0 e13;
    private I0 e14 = makeI(); private final I0 e15 = new Imm(); private I0 e16; private I0 e17; private Object e18 = new Mut(); private I0 e19;
    public T() { e2 = new Mut(); e3 = new Mut(); e4 = new Mut(); e8 = new Mut(); e12 = make(); }
    public void m2() { e2 = new Mut(); }
    public void m3() { e3 = new Imm(); }
    public void m4() { e4 = new Mut2(); }
    public void m5(Mut p) { e5 = p; }
    public void m6(I0 p) { e6 = p; }
    public void m8() { e8 = null; }
    public void m16(Mut p) { e16 = p; }  public void m16b(I0 p) { e16 = p; }
    public void m17(boolean c) { e17 = c ? new Mut() : new Mut(); }
    public void m19() { Mut m = new Mut(); e19 = m; }
    public static void m13(Mut p) { e13 = p; }
    public I0 g1() { return e1; }
    public I0 g2() { return e2; }
    public I0 g3() { return e3; }
    public I0 g4() { return e4; }
    public I0 g5() { return e5; }
    public I0 g6() { return e6; }
    public I0 g8() { return e8; }
    public I0 g9() { if (e9 == null) { e9 = new Mut(); } return e9; }
    public I0 g10() { return e10; }
    public I0 g11() { return e11; }
    public I0 g12() { return e12; }
    public static I0 g13() { return e13; }
    public I0 g14() { return e14; }
    public I0 g15() { return e15; }
    public I0 g16() { return e16; }
    public I0 g17() { return e17; }
    public Object g18() { return e18; }
    public I0 g19() { return e19; }
    public static class Builder { public T build() { T t = new T(); t.e10 = new Mut(); return t; } }
}
class Other { void f(T t) { t.e11 = new T.Mut(); } }
