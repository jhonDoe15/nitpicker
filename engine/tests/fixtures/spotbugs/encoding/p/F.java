package p;

import java.io.*;

public class F {
    static byte[] S = "a".getBytes();
    final byte[] t = "b".getBytes();
    static class P extends PrintStream { P(OutputStream o) { super(o); } P(OutputStream o, int x) { this(o); "z".getBytes(); } }
    static class Q extends ByteArrayOutputStream { public String toString() { return ""; } }
    void a(String n, Q q, byte[] b) {
        n.getBytes();
        n.getBytes();
        n.getBytes(); new String(b);
        q.toString();
        Object o = new Object() { void z() { n.getBytes(); } };
        String s = (n.isEmpty() ? n : "q").getBytes().toString();
    }
    F() { super(); new String(new byte[0]); }
}
