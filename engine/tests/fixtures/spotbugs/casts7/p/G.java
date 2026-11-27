package p;
public class G {
    public static class K {} public static class KC extends K {} public abstract static class KA extends K {} public static final class KF extends K {}
    public interface KI {} public static class KX extends K implements KI {}
    public abstract static class A {} public static class AC extends A {} public abstract static class AA extends A {} public static final class AF extends A {}
    public interface AI {} public static class AX extends A implements AI {}
    public interface N {} public static class NC implements N {} public abstract static class NA implements N {} public static final class NF implements N {}
    public interface NI extends N {}
    K fk; A fa; N fn;
    public void n1(Object o) { if (o instanceof K) { KC y = (KC) o; foo(y); } }
    void n2(Object o) { if (o instanceof K) { KC y = (KC) o; foo(y); } }
    public void n3() { KC y = (KC) fk; foo(y); }
    public void n4(K x, boolean b) { K z = b ? x : null; KC y = (KC) z; foo(y); }
    public void n5(Object o) { if (o instanceof K) { KA y = (KA) o; foo(y); } }
    void n6(Object o) { if (o instanceof K) { KA y = (KA) o; foo(y); } }
    public void n7() { KA y = (KA) fk; foo(y); }
    public void n8(K x, boolean b) { K z = b ? x : null; KA y = (KA) z; foo(y); }
    public void n9(Object o) { if (o instanceof K) { KF y = (KF) o; foo(y); } }
    void n10(Object o) { if (o instanceof K) { KF y = (KF) o; foo(y); } }
    public void n11() { KF y = (KF) fk; foo(y); }
    public void n12(K x, boolean b) { K z = b ? x : null; KF y = (KF) z; foo(y); }
    public void n13(Object o) { if (o instanceof K) { KI y = (KI) o; foo(y); } }
    void n14(Object o) { if (o instanceof K) { KI y = (KI) o; foo(y); } }
    public void n15() { KI y = (KI) fk; foo(y); }
    public void n16(K x, boolean b) { K z = b ? x : null; KI y = (KI) z; foo(y); }
    public void n17(Object o) { if (o instanceof A) { AC y = (AC) o; foo(y); } }
    void n18(Object o) { if (o instanceof A) { AC y = (AC) o; foo(y); } }
    public void n19() { AC y = (AC) fa; foo(y); }
    public void n20(A x, boolean b) { A z = b ? x : null; AC y = (AC) z; foo(y); }
    public void n21(Object o) { if (o instanceof A) { AA y = (AA) o; foo(y); } }
    void n22(Object o) { if (o instanceof A) { AA y = (AA) o; foo(y); } }
    public void n23() { AA y = (AA) fa; foo(y); }
    public void n24(A x, boolean b) { A z = b ? x : null; AA y = (AA) z; foo(y); }
    public void n25(Object o) { if (o instanceof A) { AF y = (AF) o; foo(y); } }
    void n26(Object o) { if (o instanceof A) { AF y = (AF) o; foo(y); } }
    public void n27() { AF y = (AF) fa; foo(y); }
    public void n28(A x, boolean b) { A z = b ? x : null; AF y = (AF) z; foo(y); }
    public void n29(Object o) { if (o instanceof A) { AI y = (AI) o; foo(y); } }
    void n30(Object o) { if (o instanceof A) { AI y = (AI) o; foo(y); } }
    public void n31() { AI y = (AI) fa; foo(y); }
    public void n32(A x, boolean b) { A z = b ? x : null; AI y = (AI) z; foo(y); }
    public void n33(Object o) { if (o instanceof N) { NC y = (NC) o; foo(y); } }
    void n34(Object o) { if (o instanceof N) { NC y = (NC) o; foo(y); } }
    public void n35() { NC y = (NC) fn; foo(y); }
    public void n36(N x, boolean b) { N z = b ? x : null; NC y = (NC) z; foo(y); }
    public void n37(Object o) { if (o instanceof N) { NA y = (NA) o; foo(y); } }
    void n38(Object o) { if (o instanceof N) { NA y = (NA) o; foo(y); } }
    public void n39() { NA y = (NA) fn; foo(y); }
    public void n40(N x, boolean b) { N z = b ? x : null; NA y = (NA) z; foo(y); }
    public void n41(Object o) { if (o instanceof N) { NF y = (NF) o; foo(y); } }
    void n42(Object o) { if (o instanceof N) { NF y = (NF) o; foo(y); } }
    public void n43() { NF y = (NF) fn; foo(y); }
    public void n44(N x, boolean b) { N z = b ? x : null; NF y = (NF) z; foo(y); }
    public void n45(Object o) { if (o instanceof N) { NI y = (NI) o; foo(y); } }
    void n46(Object o) { if (o instanceof N) { NI y = (NI) o; foo(y); } }
    public void n47() { NI y = (NI) fn; foo(y); }
    public void n48(N x, boolean b) { N z = b ? x : null; NI y = (NI) z; foo(y); }
    static void foo(Object o) {}
}
