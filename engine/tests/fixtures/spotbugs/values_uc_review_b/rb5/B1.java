package rb5;
public class B1 {
    int f; boolean bf; String s; int[] arr; char c; byte by; short sh;
    void a() { if (f > -5) { return; } if (f > -5) { System.out.println(); } }
    void b() { if (f > 127) { return; } if (f > 127) { System.out.println(); } }
    void c() { if (f > 128) { return; } if (f > 128) { System.out.println(); } }
    void d() { if (f > 255) { return; } if (f > 255) { System.out.println(); } }
    void e() { if (c > '\0') { return; } if (c != 0) { System.out.println(); } }
    void g() { if (c == 'é') { if (c != 'é') { System.out.println(); } } }
    void h() { if (bf) { if (!bf) { System.out.println(); } } }
    void i() { if (s.length() > 3) { if (s.length() < 2) { System.out.println(); } } }
    void j() { if (arr.length > 3) { if (arr.length < 2) { System.out.println(); } } }
    void k() { if (f > 3) { return; } else if (f > 5) { System.out.println("a"); } else { System.out.println("b"); } }
    int l() { if (f > 3) { return 1; } return f > 5 ? 2 : 3; }
    int m() { if (f > 3) { return 1; } return f > 5 ? 1 : 0; }
    int n() { if (f > 3) { return 1; } return f > 5 ? 7 : 8; }
    void o() { if (f > 3) { return; } if (f > 3) { return; } if (f > 3) { System.out.println(); } }
    void p() { if (f == 3) { if (f != 3) { System.out.println(); } } }
    void q() { if (by > 100) { if (by > 100) { System.out.println(); } } }
    void r() { if (f == -128) { if (f != -128) { System.out.println(); } } }
    void t() { if (f == 65536) { if (f != 65536) { System.out.println(); } } }
    void u() { if (f == '\t') { if (f != '\t') { System.out.println(); } } }
    void v() { if (f == 32) { if (f != 32) { System.out.println(); } } }
    void w() { if (f == 31) { if (f != 31) { System.out.println(); } } }
    void x() { if (f == 126) { if (f != 126) { System.out.println(); } } }
    void y() { if (f == 129) { if (f != 129) { System.out.println(); } } }
    void z() { if (f == -1) { if (f != -1) { System.out.println(); } } }
    void z1() { if (f == Integer.MIN_VALUE) { if (f != Integer.MIN_VALUE) { System.out.println(); } } }
    void z2() { if (c == '\\') { if (c != '\\') { System.out.println(); } } }
    void z3() { if (c == 'ÿ') { if (c != 'ÿ') { System.out.println(); } } }
    void z4() { if (c == '\u0080') { if (c != '\u0080') { System.out.println(); } } }
    void z5() { if (c == '\r') { if (c != '\r') { System.out.println(); } } }
    void z6() { if (c == '"') { if (c != '"') { System.out.println(); } } }
    void z7() { if (c == '\f') { if (c != '\f') { System.out.println(); } } }
    void z8() { if (c == '\b') { if (c != '\b') { System.out.println(); } } }
    void z9() { if (c == 127) { if (c != 127) { System.out.println(); } } }
    void za() { if (sh > 40000) { System.out.println(); } if (sh < -40000) { System.out.println(); } }
    void zb() { if (c == 0x1F600) { System.out.println(); } if (c >= 0) { System.out.println(); } if (c < 0) { System.out.println(); } }
    void zc() { if (by == 200) { System.out.println(); } if (by > 127) { System.out.println(); } }
}
