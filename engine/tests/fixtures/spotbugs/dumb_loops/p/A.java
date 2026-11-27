package p;
public class A {
    public int m1(int x, byte[] a) { byte b = 0; for (int i = 0; i < 3; i++) b = a[i]; return (x << 8) | b; }
    public int m2(int x, byte[] a) { byte b = 0; b = a[0]; return (x << 8) | b; }
    public int m3(int x, byte[] a) { byte b; if (x > 0) b = a[0]; else b = a[1]; return (x << 8) | b; }
    public int m4(int x, byte[] a) { byte b; if (x > 0) b = 1; else b = a[1]; return (x << 8) | b; }
    public int m5(int x, byte[] a) { byte b = a[0]; if (x > 0) b = 1; return (x << 8) | b; }
    public int m6(int x, byte[] a) { byte b = a[0]; if (x > 0) b = a[1]; return (x << 8) | b; }
    public int m7(int x, byte[] a) { byte b = a[0]; b = (byte) x; return (x << 8) | b; }
    public int m8(int x, byte[] a) { byte b = a[0]; if (x > 3) { b = 1; } else { b = 2; } return (x << 8) | b; }
    public int m9(int x, byte[] a) { byte b = a[0]; int c = b; b = 4; return (x << 8) | c; }
    public int m10(int x, byte[] a) { byte b = 4; int c = b; return (x << 8) | c; }
    public int m11(int x, byte[] a) { int c = 4; return (x << 8) | (byte) c; }
    public int m12(int x, byte[] a) { byte b = a[0]; b <<= 8; return b | x; }
    public int m13(int x, byte[] a) { byte b = (byte) (x >> 8); return (x << 8) | b; }
    public int m14(int x, byte[] a) { byte b = (byte) 7; return (x << 8) | b; }
    public boolean m15(byte[] a) { byte b = 0; for (byte y : a) b = y; return b == 200; }
    public boolean m16(byte[] a) { byte b = a[0]; b = 0; return b == 200; }
    public boolean m17(byte a) { a = 0; return a == 200; }
    public boolean m18(byte a, boolean f) { if (f) a = 0; return a == 200; }
    public boolean m19(byte a, boolean f) { while (a != 200) { a = 0; } return true; }
    public boolean m20(byte a, boolean f) { a = (byte) (a + 1); return a == 200; }
    public boolean m21(byte a, boolean f) { a += 1; return a == 200; }
    public boolean m22(char a, boolean f) { a = 0; return a < 0; }
    public boolean m23(char a, boolean f) { if (f) a = 0; return a < 0; }
    public boolean m24(int a, boolean f) { a = 0; return a < 0; }
}
