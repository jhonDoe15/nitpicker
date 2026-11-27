package p;

public class A {
    byte fb;
    byte[] fa;
    static final byte K = 5;
    int ior1(byte[] b, int x) { return (x << 8) | b[0]; }
    int ior2(byte b, int x) { return (x << 8) | b; }
    int ior3(byte[] b) { return (b[0] << 8) | b[1]; }
    int ior4(int x) { return (x << 8) | fb; }
    int ior5(int x) { return (x << 8) | fa[0]; }
    int ior6(byte[] b, int x) { return b[0] | (x << 8); }
    int ior7(byte[] b, int x) { return x | b[0]; }
    int ior8(byte[] b, int x) { return (x << 16) | b[0]; }
    int ior9(byte[] b, int x) { return (x * 256) | b[0]; }
    int ior10(byte[] b, int x) { return (x << 8) | (b[0] & 0xff); }
    long ior11(byte[] b, long x) { return (x << 8) | b[0]; }
    int ior12(byte[] b, int x) { int y = b[0]; return (x << 8) | y; }
    int ior13(byte[] b, int x) { return (x << 4) | b[0]; }
    int ior14(byte[] b, int x) { return (x << 9) | b[0]; }
    int ior15(byte[] b, int x) { return ((x << 8) | b[0]) << 8 | b[1]; }
    int ior16(byte[] b, int x) { x <<= 8; return x | b[0]; }
    int ior17(byte[] b, int x) { return (x << 8) ^ b[0]; }
    int ior18(byte[] b, int x) { return (x >> 8) | b[0]; }
    int add1(byte[] b, int x) { return (x << 8) + b[0]; }
    int add2(byte b, int x) { return (x << 8) + b; }
    int add3(byte[] b, int x) { return b[0] + (x << 8); }
    int add4(byte[] b, int x) { return x + b[0]; }
    int add5(byte[] b, int x) { return (x << 16) + b[0]; }
    long add6(byte[] b, long x) { return (x << 8) + b[0]; }
    int add7(byte[] b) { return (b[0] << 8) + b[1]; }
    int mix(byte[] b, int x) { return ((x << 8) | b[0]) + ((x << 8) | b[1]); }
    int k1(int x) { return (x << 8) | K; }
    int k2(byte[] b, int x) { return (x << 8) | (int) b[0]; }
    int k3(byte[] b, int x) { return (x << 8) | (short) b[0]; }
    int ch(char[] c, int x) { return (x << 8) | c[0]; }
    int sh(short[] c, int x) { return (x << 8) | c[0]; }
}
