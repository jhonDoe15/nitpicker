package p;
public class V { int g, ab, abc, abcd;
    void d1(int AB) { g = AB; this.ab = this.ab; }
    void d2(int ABC) { g = ABC; this.ab = this.ab; }
    void d3(int ABCD) { g = ABCD; this.ab = this.ab; }
    void d4(int AbCd) { g = AbCd; this.abc = this.abc; }
    void d5(int ABCd) { g = ABCd; this.abc = this.abc; }
    void d6(int ABCDE) { g = ABCDE; this.abc = this.abc; }
    void d7(int Abx) { g = Abx; this.abc = this.abc; }
    void d8(int ABx) { g = ABx; this.abc = this.abc; }
    void d9(int ABXY) { g = ABXY; this.abcd = this.abcd; }
    void d10(int AB, int ab2) { this.ab = this.ab; }
    void d11(int Ab, int aB) { this.ab = this.ab; }
    void d12(int Ab, int ac) { this.ab = this.ab; }
    Object[] read() { return new Object[] { ab, abc, abcd }; }
}
