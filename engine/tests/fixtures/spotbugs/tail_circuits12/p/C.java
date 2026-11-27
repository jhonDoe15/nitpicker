package p;
public class C {
    static boolean a() { return true; }
    static boolean b(Object o) { return o != null; }
    void n1(Boolean z) { if (z & a()) {} }
    void n2(Boolean z) { if (a() & z) {} }
    void n3(Boolean z, Boolean y) { if (z & y) {} }
    void n4(Boolean z, Object x) { if (z & x.hashCode() > 1) {} }
    void n5(Object x, boolean z) { if (a() & (z & b(x))) {} }
    void n6(Object x, boolean z) { if (a() & (b(x) & z)) {} }
    void n7(Object x, boolean z) { if (a() & (b(x) & a())) {} }
    void n8(Object x, boolean z) { if (z & (b(x) & a())) {} }
    void n9(Object x, boolean z) { if (z & (b(x) | a())) {} }
    void n10(Object x, boolean z) { if (z & (b(x) ^ a())) {} }
    void n11(Object x, boolean z) { if (x != null & (b(x) & a())) {} }
    void n12(Object x) { if (a() & b(x)) {} int i = x == null ? 1 : 2; }
    void n13(Object x) { int i = x == null ? 1 : 2; if (a() & b(x)) {} }
    void n14(Object x) { int i = x == null ? 1 : 2; if (x.hashCode() > 3 & b(x)) {} }
    void n15(Object x) { int i = x == null ? 1 : 2; if (b(x) & x.hashCode() > 3) {} }
    void n16(Object x) { int i = x == null ? 1 : 2; if (x.hashCode() > 3 & x.hashCode()>2) {} }
    void n17(Object x) { int i = x == null ? 1 : 2; if (x.hashCode() > 3 & a()) {} }
    void n18(Object x) { int i = x == null ? a() ? 1 : 2 : 3; if (b(x) & a()) {} }
    void n19(Object x) { int i = x == null ? 5 : 2; if (b(x) & a()) {} }
    void n20(Object x) { boolean q = x == null; if (b(x) & a()) {} }
    void n21(Object x) { boolean q = x != null; if (b(x) & x.hashCode() > 1) {} }
    void n22(Object x) { if (x != null) {} if (b(x) & a()) {} }
    void n23(int k, Object x) { if (switch (k) { case 1 -> a() & b(x); default -> false; }) {} }
    void n24(int k, Object x) { if (switch (k) { case 1 -> a() & b(x); default -> false; } && a()) {} }
    void n25(int k, Object x) { boolean r = switch (k) { case 1 -> a() & b(x); default -> false; }; }
    void n26(int k, Object x) { if (a() & switch (k) { case 1 -> true; default -> false; }) {} }
    void n27(int k, Object x) { if (a() & b(x)) {} if (a() & b(x)) {} }
    void n28(int k, Object x) { if (a() & switch (k) { case 1 -> b(x); default -> false; }) {} }
    void n29(Object x) { if (a() ? a() & b(x) : false) {} }
    void n30(Object x) { if (a() ? (a() & b(x)) : a()) {} }
    void n31(Object x) { boolean q = a() ? a() & b(x) : false; }
    void n32(Object x) { if (a() ? true : a() & b(x)) {} }
}
