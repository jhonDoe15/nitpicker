package r;
import java.io.*;
import p.S;
public class U {
    void m(S s, S.Nest n, S.In i, byte[] b) throws IOException { s.skip(1); n.skip(1); i.skip(1); s.read(b); n.read(b); }
    class V extends S { void k(byte[] b) throws IOException { skip(1); read(b); } }
    static class W<T extends S> { void k(T t, byte[] b) throws IOException { t.skip(1); t.read(b); } }
    void sw(int k, InputStream in, byte[] b) throws IOException {
        switch (k) { case 1 -> in.skip(1); case 2 -> { in.read(b); } default -> {} }
        switch (k) { case 1: in.skip(1); break; }
        int y = switch (k) { case 1 -> { in.skip(1); yield 1; } default -> 2; };
    }
}
