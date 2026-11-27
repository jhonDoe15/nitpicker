package uc;

public class U9 {
    int f;
    int g;
    static boolean q;
    U9 next;
    java.util.List<String> list;

    static void a() {}
    static int z() { return 7; }

    void t1(byte v) { if (v > 300) a(); }
    void t2(byte v) { if (v < -129) a(); }
    void t3(char v) { if (v > 70000) a(); }
    void t4(char v) { if (v < -1) a(); }
    void t5(short v) { if (v < -40000) a(); }
    void t6(byte v) { if (v >= 256) a(); }
    void t7(byte v) { if (v > 255) a(); }
    void t8(short v) { if (v > 65535) a(); }
    void t9(short v) { if (v > 32767) a(); }
    void t10(byte v) { if (v > 127) a(); }
    void t11(byte v) { if (v == 200) a(); }
    void t12(byte v) { if (v < 300) a(); }
    void t13(char v) { if (v >= 0) a(); }
    void t14(char v) { if (v < 65536) a(); }
    void t15(short v) { if (v != 40000) a(); }
    void t16(int v) { if (v > 3000000000L) a(); }
    void t17(byte[] b) { if (b[0] > 200) a(); }
    void t18(char v) { if (v > 65535) a(); }
    void t19(char v) { if (v > 65534) a(); }

    void b8(int x, int y) { if (x > 5) { q = x < 3 && y > 0; } }
    void b9(int x, int y) { if (x > 5) { q = x > 3 || y > 0; } }
    void b10(int x) { if (x > 5) { f = x > 3 ? 1 : g; } }
    void b11(int x) { if (x > 5) { q = !(x < 3); } }

    void n1(int x) { if (x > 100) { if (x < 50) a(); } }
    void n2(int x) { if (x > 255) { if (x < 200) a(); } }
    void n3(int x) { if (x > 256) { if (x < 201) a(); } }
    void n4(int x) { if (x > 1000) { if (x < 999) a(); } }
    void n5(int x) { if (x > 4096) { if (x < 4095) a(); } }
    void n6(int x) { if (x > 65535) { if (x < 65534) a(); } }
    void n7(int x) { if (x < -1000) { if (x > -999) a(); } }
    void n8(int x) { if (x < -129) { if (x > -128) a(); } }
    void n9(long x) { if (x > 5) { if (x < 3L) a(); } }
    void n10(long x) { if (x < -5) { if (x > -3L) a(); } }
    void n11(int x) { if (x > 127) { if (x < 126) a(); } }
    void n12(int x) { if (x > 128) { if (x < 127) a(); } }
    void n13(int x) { if (x > 0x10) { if (x < 15) a(); } }
    void n14(long x) { if (x > 300) { if (x < 256) a(); } }

    void m1() { if (z() > 5) { if (z() > 3) a(); } }
    void m2() { if (list.size() > 5) { if (list.size() > 3) a(); } }
    void m3(String s) { if (s.length() > 5) { if (s.length() < 3) a(); } }

    void w1(int x) { if (x == 3 || x == 4) { if (x == 5) a(); } }
    void w2(int x) { if (x > 5) { x += 1; if (x < 3) a(); } }
    void w3(int x) { if (x > 5) { x++; if (x < 3) a(); } }

    U9() { if (f < 0) return; if (f < 0) a(); }
    static int sx;
    static { int x = sx; if (x > 5) { if (x < 3) a(); } }

    void l1() { Runnable r = () -> { int x = g; if (x > 5) { if (x < 3) a(); } }; r.run(); }

    class Inner {
        void i1() { if (f < 0) return; if (f < 0) a(); }
        void i2(int x) { if (x > 5) { if (x < 3) a(); } }
    }

    void k1(U9 o) { if (o.next.f < 0) return; if (o.next.f < 0) a(); }
}
