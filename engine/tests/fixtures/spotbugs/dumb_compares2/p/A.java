package p;
public class A {
    boolean c1(byte b) { return b > 200; }
    boolean c2(byte b) { return b < 200; }
    boolean c3(byte b) { return b == 300; }
    boolean c4(byte b) { return b == -200; }
    boolean c5(byte b) { return b == 256; }
    boolean c6(byte b) { return b != -129; }
    boolean c7(byte b) { return b <= -129; }
    boolean c8(byte b) { return b >= -128; }
    boolean c9(byte b) { return b < -129; }
    boolean c10(byte b) { return -129 == b; }
    boolean c11(byte b) { return 128 > b; }
    boolean c12(byte b) { return 127 < b; }
    boolean c13(byte b) { return b == 1000; }
    boolean c14(byte b) { return b == 254; }
    boolean c15(char c) { return c < -1; }
    boolean c16(char c) { return c > -1; }
    boolean c17(char c) { return c == -5; }
    boolean c18(char c) { return c >= -3; }
    boolean c19(char c) { return -1 == c; }
    boolean c20(char c) { return -1 != c; }
    boolean c21(char c) { return c <= -1; }
    boolean c22(int x) { return (x & 0x7fffffff) < 0; }
    boolean c23(int x) { return (x & -2) < 0; }
    boolean c24(int x) { return (x & 0xff) == -1; }
    boolean c25(int[] a) { return a.length == -1; }
    boolean c26(int[] a) { return -1 == a.length; }
    boolean c27(int x) { return (0xff & x) < 0; }
    boolean c28(long x) { return (x & 0xffL) < 0; }
    boolean c29(int x) { return x < -2147483649L; }
    boolean c30(int x) { return x == 4294967296L; }
    boolean c31(int x) { return x == 0xffffffffL; }
    boolean c32(int x) { return x == 4096000000L; }
    boolean c33(int x) { return x == 10000000000L; }
    boolean c34(int x) { return x == 0x1234567890L; }
    boolean c35(int x) { return x == -2147483649L; }
    boolean c36(int x) { return x > -2147483649L; }
    boolean c37(int x) { return x <= 2147483648L; }
    boolean c38(int x) { return x < 2147483649L; }
    boolean c39(int x) { return x == 2147483648L; }
    boolean c40(int x) { return x != 4294967295L; }
    boolean c41(int x) { return x == 0x100000000L; }
    boolean c42(int x) { return x == 0x7ffffffffL; }
    boolean c43(int x) { return x == Long.MIN_VALUE; }
    boolean c44(int x) { return Integer.MIN_VALUE <= x; }
    boolean c45(int x) { return x > Integer.MIN_VALUE; }
    boolean c46(int x) { return x >= Integer.MAX_VALUE; }
    boolean c47(int x) { return x < Integer.MAX_VALUE; }
    boolean c48(int x) { return x <= Integer.MIN_VALUE; }
    boolean c49(char c) { return c <= Character.MAX_VALUE; }
    boolean c50(char c) { return c > 65535; }
    boolean c51(short s) { return s <= Short.MAX_VALUE; }
    boolean c52(byte b) { return b <= Byte.MAX_VALUE; }
    boolean c53(int x) { return x != Integer.MIN_VALUE; }
}
