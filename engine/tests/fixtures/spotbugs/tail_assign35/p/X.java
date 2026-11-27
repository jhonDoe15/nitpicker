package p;
public class X {
    String s; int n;
    void a(String q) { Object o = new Object() { { s = s; } }; }
    void b(String q) { class L { L(String z) { s = s; } } }
    void c(String q) { class L2 { void m(String z) { s = s; } } }
    class In { class In2 { In2(String z) { s = s; In.this.hh = In.this.hh; } } String hh; }
    class In4 { In4(String z) { this.getClass(); s = s; n = n; } }
    class In5 { In5(String z) { s = s; In5 other = null; } }
    class In6 { String v; In6(String z) { this(); s = s; } In6() { } }
    class In7 { { s = s; } In7(String z) { } }
    class In8 { In8(String z) { Runnable r = () -> { s = s; }; } }
    enum E { A; String f; E() { f = f; } }
    enum E2 { A("x"); String f; E2(String g) { f = f; } }
    enum E3 { A; String f; void m(String a) { f = f; } }
}
