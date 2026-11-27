package p;

public class A {
    int s7(byte[] b, int x) { return (x << 7) | b[0]; }
    int s24(byte[] b, int x) { return (x << 24) | b[0]; }
    int s31(byte[] b, int x) { return (x << 31) | b[0]; }
    int s32(byte[] b, int x) { return (x << 32) | b[0]; }
    int s40(byte[] b, int x) { return (x << 40) | b[0]; }
    int sv(byte[] b, int x, int n) { return (x << n) | b[0]; }
    int m1(byte[] b, int x) { return (x & 0xff00) | b[0]; }
    int m2(byte[] b, int x) { return ((x << 8) | 0) | b[0]; }
    int l1(byte[] b, int x) { int s = x << 8; return s | b[0]; }
    long w1(byte[] b, long x) { long l = b[0]; return (x << 8) | l; }
    long w2(byte[] b, int x) { return ((long) x << 8) | b[0]; }
    long w3(byte[] b, int x) { return (long) (x << 8) | b[0]; }
    int u1(byte[] b, int x) { return (x >>> 8 << 8) | b[0]; }
    int c1(byte[] b) { return (1 << 8) | b[0]; }
    int c2(byte[] b) { return 256 | b[0]; }
    int c3(byte[] b, int x) { return (b[1] << 8) | b[0] | x; }
    int o1(byte[] b, int x) { return (x << 8) | b[0] | b[1]; }
    int o2(byte[] b, int x) { int r = 0; r |= b[0]; r = (r << 8); return r | b[1]; }
    int o3(byte[] b) { int r = 0; for (int i = 0; i < 4; i++) { r = (r << 8) | b[i]; } return r; }
    int o4(byte[] b) { int r = 0; for (int i = 0; i < 4; i++) { r <<= 8; r |= b[i]; } return r; }
    int o5(byte[] b) { int r = 0; for (int i = 0; i < 4; i++) { r = (r << 8) + b[i]; } return r; }
    int t1(byte[] b, int x, boolean f) { return (x << 8) | (f ? b[0] : b[1]); }
    int t2(byte[] b, int x, boolean f) { return (f ? x << 8 : x << 16) | b[0]; }
    int n1(byte[] b, int x) { return (x << 8) | -b[0]; }
    int n2(byte[] b, int x) { return (x << 8) | (b[0] + 1); }
    int n3(byte[] b, int x) { return (x << 8) | (byte) x; }
    int n4(int x, Byte b) { return (x << 8) | b; }
    int n5(int x, java.nio.ByteBuffer bb) { return (x << 8) | bb.get(); }
    int a1(byte[] b, int x) { return (x << 8) - b[0]; }
    int a2(byte[] b, int x) { int y = x << 8; y += b[0]; return y; }
    int a3(byte[] b, int x) { int y = x << 8; y |= b[0]; return y; }
}
