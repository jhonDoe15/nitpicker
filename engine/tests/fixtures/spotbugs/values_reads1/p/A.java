package p;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;

public class A {
    static class My extends InputStream {
        public int read() { return 0; }
    }
    static class My2 extends FilterInputStream {
        My2(InputStream in) { super(in); }
        public long skip(long n) throws IOException { return super.skip(n); }
        public int read(byte[] b, int o, int l) throws IOException { return super.read(b, o, l); }
    }
    static class NotStream {
        long skip(long n) { return n; }
        int read(byte[] b) { return 0; }
    }

    void a1(InputStream in) throws IOException { in.skip(4); }
    void a2(InputStream in, byte[] b) throws IOException { in.read(b); }
    void a3(InputStream in, byte[] b) throws IOException { in.read(b, 0, 4); }
    void a4(InputStream in) throws IOException { in.read(); }
    void a5(BufferedInputStream in) throws IOException { in.skip(4); }
    void a6(DataInputStream in, byte[] b) throws IOException { in.read(b); }
    void a7(DataInputStream in) throws IOException { in.skipBytes(4); }
    void a8(My in) throws IOException { in.skip(4); }
    void a9(My2 in, byte[] b) throws IOException { in.read(b, 0, 1); in.skip(2); }
    void b1(NotStream in, byte[] b) { in.skip(4); in.read(b); }
    void b2(Reader in, char[] c) throws IOException { in.skip(4); in.read(c); }
    void b3(RandomAccessFile in, byte[] b) throws IOException { in.read(b); in.skipBytes(3); }
    void b4(FileChannel ch, ByteBuffer b) throws IOException { ch.read(b); }
    void b5(InputStream in) throws IOException { long x = in.skip(4); }
    void b6(InputStream in, byte[] b) throws IOException { int n = in.read(b); }
    void b7(InputStream in, byte[] b) throws IOException { if (in.read(b) < 0) throw new EOFException(); }
    void b8(ByteArrayInputStream in, byte[] b) { in.read(b, 0, 2); in.skip(3); }
    void b9(InputStream in, byte[] b) throws IOException { in.readNBytes(b, 0, 2); in.skipNBytes(4); }
    void c1(ObjectInputStream in, byte[] b) throws IOException { in.read(b); in.skip(3); in.skipBytes(3); }
    private void c2(InputStream in) throws IOException { in.skip(4); }
    static void c3(InputStream in) throws IOException { in.skip(4); }
    void c4(FileInputStream in) throws IOException { in.skip(4); }
    void c5(PushbackInputStream in, byte[] b) throws IOException { in.read(b); }
    void c6(InputStream in) throws IOException { in.skip(4); in.skip(5); }
    void c7(InputStream in) throws IOException { Runnable r = () -> { try { in.skip(4); } catch (IOException e) {} }; r.run(); }
    void c8(DataInput in) throws IOException { in.skipBytes(4); }
    void c9(InputStream in, byte[] b) throws IOException { long x = in.skip(4); x = 1; System.out.println(x); }
    long d1(InputStream in) throws IOException { return in.skip(4); }
    void d2(InputStream in, byte[] b) throws IOException { Object o = in.read(b); }
    void d3(InputStream in, byte[] b) throws IOException { System.out.println(in.read(b)); }
    void d4(InputStream in, byte[] b) throws IOException { in.read(b, 0, b.length); }
    void d5(InputStream in) throws IOException { this.<InputStream>id(in).skip(3); }
    <T> T id(T t) { return t; }
    void d6(InputStream in, byte[] b) throws IOException {
        try (InputStream x = in) { x.read(b); }
    }
}
