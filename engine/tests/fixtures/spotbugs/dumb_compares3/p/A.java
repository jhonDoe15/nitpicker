package p;
public class A {
    char fc; byte fb; static byte sb;
    Object c1(int x) { return x == 0x80000002L; }
    Object c2(int x) { return x == 0x80000003L; }
    Object c3(int x) { return x == 0x180000000L; }
    Object c4(int x) { return x == 0x300000000L; }
    Object c5(int x) { return x == 0x123000000L; }
    Object c6(int x) { return x == 0xff00000000L; }
    Object c7(int x) { return x == -4294967296L; }
    Object c8(int x) { return x == -2147483650L; }
    Object c9(int x) { return x == 0xf0f0f0f0L; }
    Object c10(int x) { return x == 0x1000000001L; }
    Object c11(int x) { return x == 0x1ffffffffL; }
    Object c12(int x) { return x == 0x10000000fL; }
    Object c13(int x) { return x == 0x110000000L; }
    Object c14(int x) { return x == 0x101000000L; }
    Object c15(int x) { return x == 0x100100000L; }
    Object c16(int x) { return x == 0x8000000000L; }
    Object c17(int x) { return x == -0x8000000000L; }
    Object c18(int x) { return x == 0x200000000L; }
    Object c19(int x) { return x == 0x2fffffffL + 0x60000000L; }
    Object c20(byte b) { return b > 128; }
    Object c21(byte b) { return b <= 128; }
    Object c22(byte b) { return b >= 129; }
    Object c23(byte b) { return b >= -129; }
    Object c24(byte b) { return b < 129; }
    Object c25(byte b) { return b != 128; }
    Object c26(byte b) { return b == 127; }
    Object c27(int x, byte b) { return (x = b) == 200; }
    Object c28(byte[] a) { int y = a[0]; return y == 200; }
    Object c29(char[] a) { int y = a[0]; return y < 0; }
    Object c30(char c) { return (int) c < 0; }
    Object c31(String s) { return s.charAt(0) < 0; }
    Object c32(String s) { return s.charAt(0) == -1; }
    Object c33(Object o) { return fc < 0; }
    Object c34(Object o) { return fb == 200; }
    Object c35(Object o) { return sb == 200; }
    Object c36(int x) { return x % 1; }
    Object c37(long x) { return x % 1; }
    Object c38(int x) { return x % -1; }
    Object c39(long x) { return x % 1L; }
    Object c40(int x) { x %= 1; return x; }
    Object c41(double d) { return d % 1; }
    Object c42(Integer x) { return x % 1; }
    Object c43(int x) { return (x + 1) % 1; }
    Object c44(int x) { return 1 % x; }
}
