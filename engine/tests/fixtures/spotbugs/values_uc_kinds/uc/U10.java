package uc;

public class U10 {
    long lf; char cf; boolean bf;
    static void a() {}

    void t1(short v) { if (v < 40000) a(); }
    void t2(short v) { if (v >= -32768) a(); }
    void t3(short v) { if (v <= 32767) a(); }
    void t4(char v) { if (v <= 65535) a(); }
    void t5(char v) { if (v == 70000) a(); }
    void t6(char v) { if (v != 70000) a(); }
    void t7(short v) { if (v == -40000) a(); }
    void t8(short v) { if (v > -40000) a(); }
    void t9(char v) { if (v > 65536) a(); else a(); }
    void t10(short v) { short w = v; if (w > 40000) a(); }
    void t11() { if (cf > 70000) a(); }
    void t12(char v) { if (v < 70000) a(); }
    void t13(short v) { if (v > 5) { if (v > 40000) a(); } }
    void t14(char v) { if (v != 65536) a(); }

    void c1(char c) { if (c > 1) { if (c < 1) a(); } }
    void c2(char c) { if (c > 31) { if (c < 31) a(); } }
    void c3(char c) { if (c > 32) { if (c < 32) a(); } }
    void c4(char c) { if (c > 127) { if (c < 127) a(); } }
    void c5(char c) { if (c > '\n') { if (c < '\n') a(); } }
    void c6(char c) { if (c > 0) { if (c < 0) a(); } }
    void c7(char c) { if (c > '\'') { if (c < '\'') a(); } }
    void c8(char c) { if (c > '\\') { if (c < '\\') a(); } }
    void c9(char c) { if (c > 13) { if (c < 13) a(); } }
    void c10(char c) { if (c > 128) { if (c < 128) a(); } }
    void c11(char c) { if (c > 8) { if (c < 8) a(); } }
    void c12(char c) { if (c > 12) { if (c < 12) a(); } }
    void c13(char c) { if (c > 34) { if (c < 34) a(); } }

    void i1(int x) { if (x > 31) { if (x < 31) a(); } }
    void i2(int x) { if (x > 32) { if (x < 32) a(); } }
    void i3(int x) { if (x > 48) { if (x < 48) a(); } }
    void i4(int x) { if (x > 39) { if (x < 39) a(); } }
    void i5(int x) { if (x > 92) { if (x < 92) a(); } }
    void i6(int x) { if (x > 128) { if (x < 128) a(); } }
    void i7(int x) { if (x > 1) { if (x < 1) a(); } }
    void i8(int x) { if (x > 34) { if (x < 34) a(); } }

    void l1(long x) { if (x > 50) { if (x < 50) a(); } }
    void l2(long x) { if (x > 2147483647L) { if (x < 2147483647L) a(); } }
    void l3(long x) { if (x > 2147483648L) { if (x < 2147483648L) a(); } }
    void l4(long x) { if (x < -2147483649L) { if (x > -2147483649L) a(); } }
    void l5(long x) { if (x > 200) { if (x < 200) a(); } }

    void u1(Long x) { if (x > 5) { if (x < 3) a(); } }
    void u2(Character x) { if (x > 'a') { if (x < 'a') a(); } }
    void u3(Integer x) { if (x > 5) { if (x < 3) a(); } }
    void u4(Boolean x) { if (x) { if (!x) a(); } }

    void f1() { if (lf > 5) { if (lf < 3) a(); } }
    void f2() { if (cf > 'a') { if (cf < 'a') a(); } }
    void f3() { if (bf) { if (!bf) a(); } }
    void f4() { if (!bf) { if (bf) a(); } }

    void x1(int x) { if (x == 5) { if (x != 5) a(); } }
    void x2(int x) { if (x < 5) { if (x >= 5) a(); } }
    void x3(int x) { if (x <= 5) { if (x > 5) a(); } }
    void x4(int x) { if (x >= 5) { if (x < 5) a(); } }
    void x5(int x) { if (x != 5) { if (x == 5) a(); } }
    void x6(int x) { if (x < 5) { if (x < 7) a(); } }
    void x7(int x) { if (x < 5) { if (x <= 7) a(); } }
    void x8(int x) { if (x < 5) { if (x != 7) a(); } }
    void x9(int x) { if (x < 5) { if (x == 7) a(); } }
    void x10(int x) { if (x < 5) { if (x > 7) a(); } }
    void x11(int x) { if (x < 5) { if (x >= 7) a(); } }
    void x12(int x) { if (x == 5) { if (x == 5) a(); } }
    void x13(int x) { if (x == 5) { if (x <= 5) a(); } }
    void x14(int x) { if (x == 5) { if (x < 6) a(); } }
}
