package p;

public class A {
    int fi;
    byte[] buf;
    int k1(byte[] b, int x) { return (x & 0xffffff00) | b[0]; }
    int k2(byte[] b, int x) { return (x & 0x100) | b[0]; }
    int k3(byte[] b, int x) { return (x & 0x180) | b[0]; }
    int k4(byte[] b, int x) { return (0xff00 & x) | b[0]; }
    long k5(byte[] b, long x) { return (x & 0xff00L) | b[0]; }
    long k6(byte[] b, long x) { return (x << 40) | b[0]; }
    long k7(byte[] b, long x) { return (x << 64) | b[0]; }
    long k8(byte[] b, long x) { return (x << 72) | b[0]; }
    int f1(byte[] b, int x) { fi = x << 8; return fi | b[0]; }
    int f2(byte[] b, int x) { fi = b[0]; return (x << 8) | fi; }
    int f3(byte[] b, int x, boolean c) { int y; if (c) { y = x << 8; } else { y = x; } return y | b[0]; }
    int f4(byte[] b, int x, boolean c) { int y = b[0]; if (c) { y = x; } return (x << 8) | y; }
    int f5(int x) { return (x << 8) | buf[0]; }
    int f6(int x) { return (x << 8) | get(); }
    byte get() { return 1; }
    int f7(int x, byte[][] b) { return (x << 8) | b[0][0]; }
    int f8(byte[] b, int x) { int y = b[0]; y = y + 0; return (x << 8) | y; }
    int f9(byte[] b, int x) { int y = (x << 8); int z = y; return z | b[0]; }
    int f10(byte[] b, int x) { int y = (x << 8) | 1; return y | b[0]; }
    int f11(byte[] b, int x) { return (x << 8 << 0) | b[0]; }
    int f12(byte[] b, int x) { return ((x << 8) >> 0) | b[0]; }
    int f13(byte[] b, int x) { return ((x << 8) * 1) | b[0]; }
    int f14(byte[] b, int x) { return ((x << 8) & x) | b[0]; }
    int f15(byte[] b, int x) { return ((x << 8) + 0) | b[0]; }
    int f16(byte b, int x) { return (x << 8) | ((int) b); }
    int f17(byte[] b, int x) { return (x << 8) | (char) b[0]; }
}
