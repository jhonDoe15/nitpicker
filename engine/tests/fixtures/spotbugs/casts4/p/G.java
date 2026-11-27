package p;
public class G {
    public static class K {}
    public static class KC extends K {}
    public abstract static class KA extends K {}
    public static final class KF extends K {}
    public interface KI {} public static class KX extends K implements KI {}
    public abstract static class A {}
    public static class AC extends A {}
    public abstract static class AA extends A {}
    public static final class AF extends A {}
    public interface AI {} public static class AX extends A implements AI {}
    public interface N {}
    public static class NC implements N {}
    public abstract static class NA implements N {}
    public static final class NF implements N {}
    public interface NI extends N {}
    public void g1(K x) { KC y = (KC) x; foo(y); }
    void g2(K x) { KC y = (KC) x; foo(y); }
    public void g3(K x) { KA y = (KA) x; foo(y); }
    void g4(K x) { KA y = (KA) x; foo(y); }
    public void g5(K x) { KF y = (KF) x; foo(y); }
    void g6(K x) { KF y = (KF) x; foo(y); }
    public void g7(K x) { KI y = (KI) x; foo(y); }
    void g8(K x) { KI y = (KI) x; foo(y); }
    public void g9(A x) { AC y = (AC) x; foo(y); }
    void g10(A x) { AC y = (AC) x; foo(y); }
    public void g11(A x) { AA y = (AA) x; foo(y); }
    void g12(A x) { AA y = (AA) x; foo(y); }
    public void g13(A x) { AF y = (AF) x; foo(y); }
    void g14(A x) { AF y = (AF) x; foo(y); }
    public void g15(A x) { AI y = (AI) x; foo(y); }
    void g16(A x) { AI y = (AI) x; foo(y); }
    public void g17(N x) { NC y = (NC) x; foo(y); }
    void g18(N x) { NC y = (NC) x; foo(y); }
    public void g19(N x) { NA y = (NA) x; foo(y); }
    void g20(N x) { NA y = (NA) x; foo(y); }
    public void g21(N x) { NF y = (NF) x; foo(y); }
    void g22(N x) { NF y = (NF) x; foo(y); }
    public void g23(N x) { NI y = (NI) x; foo(y); }
    void g24(N x) { NI y = (NI) x; foo(y); }
    static void foo(Object o) {}
}
