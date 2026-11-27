package p;
import java.io.*;
import java.util.*;
public class C {
    static class MyBAOS extends ByteArrayOutputStream { }
    static class MyBAOS2 extends ByteArrayOutputStream { public synchronized String toString() { return "x"; } }
    static class R1 extends InputStreamReader { R1(InputStream i) { super(i); } }
    static class R2 extends OutputStreamWriter { R2(OutputStream i) { super(i); } }
    static class R3 extends FileReader { R3(String i) throws Exception { super(i); } }
    static class R4 extends FileWriter { R4(String i) throws Exception { super(i); } }
    static class R5 extends PrintStream { R5(OutputStream i) { super(i); } }
    static class R6 extends PrintWriter { R6(OutputStream i) { super(i); } }
    static class R9 extends String2 { }
    static class String2 { }
    static class MyBAOS3 extends ByteArrayOutputStream { String t() { return super.toString(); } }
    static class MyBAOS4 extends MyBAOS3 { String t() { return super.toString(); } }
    void a(ByteArrayOutputStream p) {
        ByteArrayOutputStream o = new MyBAOS();
        o.toString();
    }
    void b(ByteArrayOutputStream p) {
        ByteArrayOutputStream o = new MyBAOS2();
        if (p == null) o = new ByteArrayOutputStream();
        o.toString();
    }
    void c(boolean c) {
        ByteArrayOutputStream o = c ? new ByteArrayOutputStream() : new MyBAOS();
        o.toString();
    }
    void d(boolean c) {
        (c ? new ByteArrayOutputStream() : new MyBAOS2()).toString();
    }
    void e(boolean c) {
        (c ? new ByteArrayOutputStream() : new ByteArrayOutputStream()).toString();
    }
    void f(ByteArrayOutputStream x) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        Object y = o;
        ((ByteArrayOutputStream) y).toString();
    }
    void g() {
        ByteArrayOutputStream o = new MyBAOS2();
        o.toString();
        ByteArrayOutputStream o2 = new MyBAOS2();
        ((ByteArrayOutputStream) o2).toString();
    }
    void h(ByteArrayOutputStream a) { a.toString(); }
    void i() { final ByteArrayOutputStream b = new MyBAOS2(); Runnable r = () -> b.toString(); }
    ByteArrayOutputStream fld = new MyBAOS2();
    void j() { fld.toString(); }
    ByteArrayOutputStream mk() { return new MyBAOS2(); }
    void k() { mk().toString(); }
}
