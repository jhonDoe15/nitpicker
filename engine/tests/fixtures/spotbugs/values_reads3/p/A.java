package p;

import java.io.*;
import java.nio.CharBuffer;
import javax.imageio.stream.ImageInputStream;

public class A {
    static class C implements Closeable {
        public void close() {}
        long skip(long n) { System.out.println(n); return n; }
        int read(byte[] b) { System.out.println(b); return 0; }
    }
    interface Src extends Closeable { long skip(long n) throws IOException; int read(byte[] b) throws IOException; }
    static class R extends Reader {
        public int read(char[] c, int o, int l) { return 0; }
        public void close() {}
    }
    static class Bb extends BufferedInputStream {
        Bb(InputStream i) { super(i); }
        public long skip(long n) throws IOException { return super.skip(n); }
    }

    void a1(C c, byte[] b) { c.skip(1); c.read(b); }
    void a2(Src s, byte[] b) throws IOException { s.skip(1); s.read(b); }
    void a3(ImageInputStream s, byte[] b) throws IOException {
        s.skipBytes(1);
        s.read(b);
        s.skipBytes(2L);
    }
    void a4(R r, char[] c, CharBuffer cb) throws IOException {
        r.read(c);
        r.read(cb);
        r.skip(2);
    }
    <T extends InputStream> void a5(T t, byte[] b) throws IOException {
        t.skip(1);
        t.read(b);
    }
    void a6(InputStream in) {
        try { in.skip(1); } catch (IOException e) { throw new UncheckedIOException(e); }
    }
    void a7(InputStream in) throws IOException {
        try {
            in.skip(1);
        } finally {
            System.out.println();
        }
    }
    void a8(Bb in) throws IOException {
        in.skip(1);
    }
    void a9() throws IOException {
        InputStream.nullInputStream().skip(3);
        Reader.nullReader().skip(2);
    }
    void b1(InputStream in) throws IOException {
        new Object() {
            void m() throws IOException { in.skip(1); }
        }.m();
    }
    void b2(InputStream in, byte[] b) throws IOException {
        in.skip(1);
        in.read(b);
        in.skip(2);
        in.read(b);
        in.read(b, 0, 1);
    }
    void b3(InputStream in, byte[] b) throws IOException {
        in
            .skip(
                1);
    }
    void b4(InputStream in) throws IOException {
        Runnable r = () -> { try { in.skip(1); } catch (IOException e) { } };
        Runnable q = () -> { try { in.skip(1); } catch (IOException e) { } };
    }
    void b5(java.io.StringBufferInputStream s, java.io.LineNumberInputStream l) throws IOException {
        s.skip(1);
        l.skip(1);
    }
}
