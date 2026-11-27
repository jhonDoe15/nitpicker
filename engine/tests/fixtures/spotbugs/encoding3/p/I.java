package p;
import java.io.*;
public class I {
    static class X1 extends ByteArrayOutputStream { String q() { return toString(); } }
    static class X2 extends ByteArrayOutputStream {
        String q() { return toString(); }
        String r() { return super.toString(); }
    }
    static class X3 extends ByteArrayOutputStream { }
    void a(X1 x) { x.toString(); }
    void b(X2 x) { x.toString(); }
    void c(X3 x) { x.toString(); }
    void d() { new X3().toString(); }
}
