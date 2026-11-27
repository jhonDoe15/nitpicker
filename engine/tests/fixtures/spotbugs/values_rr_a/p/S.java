package p;
import java.io.*;
public class S extends InputStream {
    public int read() { return 0; }
    void a(byte[] b) throws IOException { skip(1); this.skip(1); super.skip(1); read(b); this.read(b); super.read(b); super.read(b,0,1); }
    @Override public long skip(long n) throws IOException { return super.skip(n); }
}
class F extends FilterInputStream {
    F() { super(null); }
    void a(byte[] b) throws IOException { skip(1); super.skip(1); read(b); this.read(b, 0, 1); }
}
class B extends BufferedInputStream {
    B() { super(null); }
    void a(byte[] b) throws IOException { skip(1); super.skip(1); read(b); }
}
class R extends Reader {
    public int read(char[] c, int o, int l) { return 0; } public void close() {}
    void a(char[] c) throws IOException { skip(1); read(c); super.skip(1); this.read(c,0,1); }
}
class Cov extends InputStream {
    public int read() { return 0; }
    Cov self() { return this; }
    void a(Cov c, byte[] b) throws IOException { self().skip(1); self().read(b); c.self().skip(2); }
}
class Mine extends InputStream {
    public int read() { return 0; }
    public int read(byte[] b) { return 0; }
    public long skip(long n) { return 0; }
    void a(Mine m, byte[] b) { m.read(b); m.skip(1); }
}
