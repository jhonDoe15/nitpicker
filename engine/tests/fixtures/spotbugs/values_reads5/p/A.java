package p;

import java.io.*;

public class A {
    interface I1 extends DataInput { int skipBytes(int n) throws IOException; int read(byte[] b) throws IOException; long skip(long n); }
    interface I2 extends DataInput, Closeable { }
    static abstract class K implements DataInput { public int read(byte[] b) { return 0; } public long skip(long n) { return n; } }
    static abstract class K2 implements I1 { }
    interface I3 extends Closeable { int read(char[] c); }
    static abstract class K3 implements Readable { public abstract int read(char[] c); public abstract long skip(long n); }

    void a1(I1 i, byte[] b) throws IOException {
        i.skipBytes(1);
        i.read(b);
        i.skip(1);
    }
    void a2(I2 i) throws IOException {
        i.skipBytes(1);
    }
    void a3(K k, byte[] b) throws IOException {
        k.skipBytes(1);
        k.read(b);
        k.skip(1);
    }
    void a4(K2 k, byte[] b) throws IOException {
        k.skipBytes(1);
        k.read(b);
    }
    void a5(I3 i, K3 k, char[] c) {
        i.read(c);
        k.read(c);
        k.skip(1);
    }
    void a6(ObjectInput o, ObjectInputStream s, byte[] b) throws IOException {
        o.read(b, 0, 1);
        o.skipBytes(1);
        s.read(b, 0, 1);
    }
}
