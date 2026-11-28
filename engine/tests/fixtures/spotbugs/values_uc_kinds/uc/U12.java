package uc;

public class U12 {
    static boolean q;
    static void a() {}
    void v1(int x) { if (x > 5) { q = x <= 5; } }
    void v2(int x) { if (x > 5) { q = x < 3; } }
    void v3(int x) { if (x < 5 || x < 5) a(); }
    boolean v4(char c) { return c > 65536; }
    boolean v5(short s) { return s > 32768; }
    boolean v6(short s) { return s < -32769; }
    void v7(int x) { if (x > 5) { q = x > 5; } }
    void v8(int x) { if (x > 5 || x > 5) a(); }
}
