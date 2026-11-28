package p;
import java.io.*;
public class G {
    static class M1 extends ByteArrayOutputStream { }
    static class M2 extends M1 { }
    static class M3 extends M2 { }
    static class M4 extends M1 { public String toString() { return "x"; } }
    static class M5 extends M4 { }
    void a(M1 x) { x.toString(); }
    void b(M2 x) { x.toString(); }
    void c(M3 x) { x.toString(); }
    void d(M5 x) { x.toString(); }
    void e() { new M2().toString(); }
    static class T1 extends ByteArrayOutputStream { String q() { return toString(); } }
    static class T2 extends M1 { String q() { return toString(); } }
    static class T3 extends M1 { String q() { return this.toString(); } }
    static class T4 extends M2 { String q() { return super.toString(); } }
    static class T5 extends ByteArrayOutputStream { String q() { return super.toString(); } }
}
