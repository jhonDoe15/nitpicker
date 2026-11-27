package p;

import java.io.*;
import java.util.zip.*;

public class A {
    static class B extends BufferedInputStream { B(InputStream i) { super(i); } }
    static class Ba extends ByteArrayInputStream { Ba(byte[] b) { super(b); } }
    static abstract class Di implements DataInput { }
    static class Over extends InputStream {
        public int read() { return 0; }
        public long skip(int n) { return n; }
        public int read(byte[] b, int o) { return 0; }
    }
    static class Rd extends BufferedReader { Rd(Reader r) { super(r); } }
    InputStream field;
    BufferedInputStream bfield;

    void a1(InputStream in) throws IOException {
        in.skip(4);
        in.skip(5);
    }
    void a2(B in, byte[] b) throws IOException {
        in.skip(4);
        in.read(b);
    }
    void a3(Ba in, byte[] b) throws IOException {
        in.skip(4);
        in.read(b);
    }
    void a4(Di in) throws IOException {
        in.skipBytes(4);
    }
    void a5(Over in, byte[] b) throws IOException {
        in.skip(4);
        in.read(b, 1);
        in.skip(4L);
    }
    void a6(BufferedReader r, StringReader s, CharArrayReader c, InputStreamReader i, char[] b) throws IOException {
        r.skip(1);
        s.skip(1);
        c.skip(1);
        i.skip(1);
        r.read(b);
        s.read(b);
        c.read(b);
        i.read(b, 0, 1);
    }
    void a7(Rd r) throws IOException {
        r.skip(1);
    }
    void a8(ZipInputStream z, GZIPInputStream g, InflaterInputStream f, byte[] b) throws IOException {
        z.skip(1);
        g.skip(1);
        f.skip(1);
        z.read(b);
        g.read(b);
    }
    void a9(byte[] b) throws IOException {
        field.skip(1);
        bfield.skip(1);
        bfield.read(b);
    }
    void b1(BufferedInputStream in, byte[] b) throws IOException {
        in.read(b, 0, 1);
        in.read();
        ((InputStream) in).skip(3);
    }
    void b2(InputStream in, byte[] b) throws IOException {
        InputStream x = new BufferedInputStream(in);
        x.skip(3);
        new BufferedInputStream(in).skip(3);
        new ByteArrayInputStream(b).skip(1);
    }
    void b3(InputStream in, boolean c) throws IOException {
        for (int i = 0; i < 3; in.skip(1)) { i++; }
        if (c) in.skip(2);
    }
    void b4(SequenceInputStream s, PipedInputStream p, FilterInputStream f, ObjectInput o, byte[] b) throws IOException {
        s.skip(1);
        p.skip(1);
        f.skip(1);
        o.skip(1);
        o.read(b);
    }
    void b5(LineNumberReader l, PushbackReader p, PipedReader q, FilterReader f) throws IOException {
        l.skip(1);
        p.skip(1);
        q.skip(1);
        f.skip(1);
    }
    void b6(DataInputStream d, ObjectInputStream o, RandomAccessFile r) throws IOException {
        d.skip(1);
        o.skipBytes(1);
        r.skipBytes(2);
    }
}
