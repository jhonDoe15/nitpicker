package uc;

public class U11 extends Base {
    boolean flag;
    static void a() {}

    void s1(int x) { if (x < 0) return; assert x >= -1; a(); }
    void s2(int x) { assert x > 5; assert x > 3; a(); }
    void s3(int x) { if (x < 0) return; assert x < -3 : "m"; a(); }
    void s4() { if (flag == true) { if (flag == false) a(); } }
    void s5(boolean b) { if (b == false) return; if (b) a(); else a(); }
    void s6(int x) { if (x > 'a') { if (x < 'a') a(); } }
    void s7() { if (bf < 0) return; if (bf < 0) a(); }
    void s8(byte v) { if (v > 5) { if (v > 300) a(); } }
    void s9(char c) { if (c > -5) a(); }
    void s10(char c) { if (c > -5) a(); else a(); }
    void s11(short v) { if (v > -32769) a(); }
    void s12(short v) { if (v > -32770) a(); }
    void s13(int x) { if (x > 5) { a(); } else { a(); } if (x > 3) a(); }
    void s14(int x) { int y = x; if (y > 5) { if (x < 3) a(); } }
    void s15(int x) { int y = x; x = 0; if (y > 5) { if (y < 3) a(); } }
    void s16(int x) { if (x > 5) { int y = x; x = 0; if (y < 3) a(); } }
}

class Base { int bf; }
