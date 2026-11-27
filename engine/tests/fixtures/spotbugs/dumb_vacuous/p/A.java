package p;

public class A {
    int fi;
    long fl;
    static final int M = -1;
    int v1(int x) { return x & -1; }
    int v2(int x) { return -1 & x; }
    int v3(int x) { return x | 0; }
    int v4(int x) { return 0 | x; }
    int v5(int x) { return x ^ 0; }
    int v6(int x) { return 0 ^ x; }
    int v7(int x) { return x & 0xffffffff; }
    int v8(int x) { return x & M; }
    long v9(long x) { return x & -1L; }
    long v10(long x) { return x | 0L; }
    long v11(long x) { return x & 0xffffffffffffffffL; }
    int v12() { return fi & -1; }
    int v13(int[] a) { return a[0] & -1; }
    int v14(int x) { return (x + 1) & -1; }
    int v15(int x) { int y = x * 2; return y & -1; }
    int v16(int x) { x &= -1; return x; }
    int v17(int x) { x |= 0; return x; }
    int v18(int x) { return x & 0; }
    int v19(int x) { return x | -1; }
    int v20(int x) { return x + 0; }
    int v21(int x) { return x * 1; }
    int v22(int x) { return x << 0; }
    int v23(int x) { return x >> 0; }
    int v24(int x) { return x - 0; }
    int v25(int x) { return x / 1; }
    long v26(int x) { return x & 0xffffffffL; }
    int v27(byte b) { return b & -1; }
    int v28(byte b) { return b & 0xff; }
    int v29(char c) { return c & 0xffff; }
    int v30(short s) { return s & 0xffff; }
    int v31(Integer x) { return x & -1; }
    int v32(int x) { return x & ~0; }
    int v33(int x) { return getx() & -1; }
    int getx() { return 1; }
    int v34(int x) { int y = x; return y | 0; }
    long v35() { return fl & -1L; }
    int v36(int x) { return (x & -1) | 0; }
    int v37(int x, int y) { return (x + y) | 0; }
}
