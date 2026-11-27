package p;
import java.io.*;
public class S extends InputStream {
    public int read() { return 0; }
    public static class Nest extends InputStream { public int read() { return 0; } public void m(byte[] b) throws IOException { skip(1); read(b); } }
    public class In extends InputStream { public int read() { return 0; } void m(byte[] b) throws IOException { skip(1); S.this.skip(1); read(b); } }
    void m(Nest n, In i, byte[] b) throws IOException { n.skip(1); i.skip(2); n.read(b); }
}
