package p;
import java.io.*;
public class E {
    static class M1 extends ByteArrayOutputStream { }
    static class M2 extends ByteArrayOutputStream { public synchronized String toString() { return "x"; } }
    ByteArrayOutputStream f1 = new M2();
    ByteArrayOutputStream f2;
    ByteArrayOutputStream f3;
    ByteArrayOutputStream f4 = new M1();
    ByteArrayOutputStream f5 = new ByteArrayOutputStream();
    E(ByteArrayOutputStream q) { f2 = new M2(); f3 = q; f5 = new M2(); }
    void a() { f1.toString(); }
    void b() { f2.toString(); }
    void c() { f3.toString(); }
    void d() { f4.toString(); }
    void e() { f5.toString(); }
    void f() { f5 = new ByteArrayOutputStream(); }
    // super ctor tests
    static class PS1 extends PrintStream { PS1() { super(System.out); } }
    static class PS2 extends PrintStream { PS2(OutputStream o) { super(o); } }
    static class PS3 extends PrintStream { PS3(OutputStream o) { super(o, true); } }
    static class PS4 extends PrintStream { PS4() throws Exception { super("x"); } }
    static class PW1 extends PrintWriter { PW1() { super(System.out); } }
    static class IR1 extends InputStreamReader { IR1() { super(System.in); } }
    static class FW1 extends FileWriter { FW1() throws Exception { super("x"); } }
    static class FW2 extends FileWriter { FW2() throws Exception { super("x"); } void m() { new String(new byte[1]); } }
    static class PS5 extends PrintStream { PS5() { super(System.out); } PS5(int x) { super(System.out); } }
    static class PS6 extends PrintStream { PS6() { this(System.out); } PS6(OutputStream o) { super(o); } }
}
