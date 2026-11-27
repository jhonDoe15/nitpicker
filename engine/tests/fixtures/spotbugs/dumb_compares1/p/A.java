package p;
public class A {
    int fi; static int si; byte fb;
    boolean c1(int x) { return x <= Integer.MAX_VALUE; }
    boolean c2(int x) { return x >= Integer.MIN_VALUE; }
    boolean c3(int x) { return x < Integer.MIN_VALUE; }
    boolean c4(int x) { return x > Integer.MAX_VALUE; }
    boolean c5(int x) { return Integer.MAX_VALUE >= x; }
    boolean c6(int x) { return x == Integer.MAX_VALUE; }
    boolean c7(int x) { return x <= 2147483647; }
    boolean c8(long x) { return x <= Long.MAX_VALUE; }
    boolean c9(long x) { return x >= Long.MIN_VALUE; }
    boolean c10(int x) { return x <= Long.MAX_VALUE; }
    boolean c11(int x) { return x < 2147483648L; }
    boolean c12(int x) { return x > 3000000000L; }
    boolean c13(int x) { return x == 3000000000L; }
    boolean c14(int x) { return x < -3000000000L; }
    boolean c15(int x) { return 3000000000L > x; }
    boolean c16(int x) { return x > 2147483647L; }
    boolean c17(int x) { return x >= 2147483648L; }
    boolean c18(long x) { return x > 3000000000L; }
    boolean c19(byte b) { return b == 200; }
    boolean c20(byte b) { return b > 127; }
    boolean c21(byte b) { return b >= 127; }
    boolean c22(byte b) { return b >= 128; }
    boolean c23(byte b) { return b < 128; }
    boolean c24(byte b) { return b <= 127; }
    boolean c25(byte b) { return b < -128; }
    boolean c26(byte b) { return b == -129; }
    boolean c27(byte b) { return b > -129; }
    boolean c28(byte b) { return b != 255; }
    boolean c29(byte b) { return b == 128; }
    boolean c30(byte b) { return 200 == b; }
    boolean c31(byte b) { return b == 0xff; }
    boolean c32(byte[] a) { return a[0] == 200; }
    boolean c33(byte[] a) { return a[0] > 127; }
    boolean c34(byte b) { return b < 0; }
    boolean c35(char c) { return c < 0; }
    boolean c36(char c) { return c >= 0; }
    boolean c37(char c) { return c == -1; }
    boolean c38(char c) { return c <= 0; }
    boolean c39(char c) { return c > 0; }
    boolean c40(char c) { return c != -1; }
    boolean c41(char c) { return 0 > c; }
    boolean c42(char c) { return c < 65536; }
    boolean c43(char c) { return c > 65535; }
    boolean c44(char c) { return c == 65536; }
    boolean c45(short s) { return s == 40000; }
    boolean c46(short s) { return s > 32767; }
    boolean c47(short s) { return s < 0; }
    boolean c48(String s) { return s.length() < 0; }
    boolean c49(int[] a) { return a.length < 0; }
    boolean c50(Object o) { return o.hashCode() < 0; }
    boolean c51(int x) { return (x & 0xff) < 0; }
    boolean c52(int x) { return (x >>> 1) < 0; }
    boolean c53(byte b) { return (b & 0xff) == 200; }
    boolean c54(byte b) { return (b & 0xff) > 255; }
    boolean c55(Byte b) { return b == 200; }
    boolean c56(char[] a) { return a[0] < 0; }
    boolean c57(int x) { return fi <= Integer.MAX_VALUE; }
    boolean c58(int x) { return ((byte) x) == 200; }
    boolean c59(byte b) { return b == 'é'; }
    boolean c60(int x) { return (x & 0xff) > 255; }
    boolean c61(char c) { return c >= Character.MIN_VALUE; }
}
