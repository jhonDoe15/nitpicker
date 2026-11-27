package p;

import java.io.*;
import java.util.function.*;
import java.util.zip.*;
import java.security.*;
import java.nio.channels.*;
import java.nio.file.*;
import javax.crypto.CipherInputStream;

public class A {
    <T extends InputStream> void t1(T t, byte[] b) throws IOException { t.skip(1); t.read(b); }
    <T extends InputStream & Serializable> void t2(T t, byte[] b) throws IOException { t.skip(1); t.read(b, 0, 1); }
    <T extends Reader & Closeable> void t3(T t, char[] b) throws IOException { t.skip(1); t.read(b); }
    <T extends DataInput & Closeable> void t4(T t, byte[] b) throws IOException { t.skipBytes(1); t.readFully(b); }
    void w1(java.util.List<? extends InputStream> l, byte[] b) throws IOException { l.get(0).skip(1); l.get(0).read(b); }
    void arr(InputStream[] a, byte[] b) throws IOException { a[0].skip(1); a[1].read(b); }
    InputStream get() { return null; }
    BufferedInputStream getB() { return null; }
    void chain(byte[] b) throws IOException { get().skip(1); getB().skip(2); getB().read(b); }
    void zip(GZIPInputStream g, InflaterInputStream i, ZipInputStream z, byte[] b) throws IOException { g.skip(1); g.read(b); i.skip(1); z.skip(1); z.read(b,0,1); }
    void sec(DigestInputStream d, CipherInputStream c, byte[] b) throws IOException { d.skip(1); d.read(b); c.skip(1); c.read(b); }
    void misc(byte[] b) throws IOException {
        Channels.newInputStream((ReadableByteChannel) null).skip(1);
        Files.newInputStream(Paths.get("x")).read(b);
        System.in.skip(1); System.in.read(b);
        Process p = Runtime.getRuntime().exec("x"); p.getInputStream().skip(1); p.getInputStream().read(b);
        new FileInputStream("x").skip(1);
        new PushbackInputStream(null).skip(1);
        new LineNumberReader(null).skip(1);
        new StringReader("").skip(1);
        new CharArrayReader(new char[0]).skip(1);
        new PipedInputStream().read(b);
        new SequenceInputStream(null, null).skip(1);
        new ObjectInputStream(null).skip(1);
        new ObjectInputStream(null).skipBytes(1);
        new ObjectInputStream(null).read(b);
        new RandomAccessFile("x", "r").skipBytes(1);
        new RandomAccessFile("x", "r").read(b);
        new RandomAccessFile("x", "r").read(b, 0, 1);
        new DataInputStream(null).read(b);
        new DataInputStream(null).skipBytes(1);
        new DataInputStream(null).skip(1);
        new DataInputStream(null).readFully(b);
        get().readNBytes(b, 0, 1);
        get().readNBytes(1);
        get().transferTo(null);
        new InputStreamReader(null).read(new char[1]);
        new BufferedReader(null).skip(1);
        new FileReader("x").read(new char[1], 0, 1);
        new BufferedReader(null).read(new char[1]);
    }
    void rd(Reader r, char[] c) throws IOException { r.read(c); r.read(c, 0, 1); r.skip(1); r.read(); r.read(java.nio.CharBuffer.allocate(1)); }
    void sw(int k, InputStream in, byte[] b) throws IOException {
        switch (k) { case 1 -> in.skip(1); case 2 -> in.read(b); default -> {} }
        int x = k > 0 ? 1 : 2;
        interface LU { long ap(long n) throws IOException; } LU op = in::skip;
        LU op2 = n -> { in.skip(n); return 0; };
        Runnable r = () -> { try { in.skip(1); } catch (IOException e) {} };
        Runnable r2 = () -> { try { in.skip(1); } catch (IOException e) {} };
    }
    void twice(InputStream in) throws IOException {
        in.skip(1);
        in.skip(2);
        Runnable r = () -> { try { in.skip(3); } catch (IOException e) {} };
    }
    void multi(InputStream in, byte[] b) throws IOException {
        in
          .skip(
            1);
        in.
          read(b);
    }
    @SuppressWarnings("all")
    void supp(InputStream in) throws IOException { in.skip(1); }
    void one(InputStream in) throws IOException { try { in.skip(1); } catch (IOException e) {} }
    void forup(InputStream in) throws IOException { for (int i = 0; i < 1; in.skip(1)) { i++; } }
    void anon(InputStream in) throws IOException {
        Object o = new Object() { void f() throws IOException { in.skip(1); } };
        new Runnable() { public void run() { try { in.skip(1);} catch (IOException e) {} } };
    }
    static class N { static class M { void f(InputStream in) throws IOException { in.skip(1); } } }
    class Inner { void f(InputStream in) throws IOException { in.skip(1); } }
    InputStream f1 = nul(); { try { f1.skip(1); } catch (IOException e) {} }
    static InputStream nul() { return null; }
    A() {} A(int x) {}
    static { try { nul().skip(1); } catch (IOException e) {} }
}
