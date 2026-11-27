package p;
import java.util.*; import java.io.*; import java.nio.file.*; import java.sql.*;
public class A {
    static final String PW = "pw"; String fpw = "x"; static final String ROOT = "/etc";
    Object c1(int i) throws Exception { return Double.longBitsToDouble(i); }
    Object c2(short i) throws Exception { return Double.longBitsToDouble(i); }
    Object c3(long l) throws Exception { return Double.longBitsToDouble(l); }
    Object c4(int i) throws Exception { return Double.longBitsToDouble((long) i); }
    Object c5(Integer i) throws Exception { return Double.longBitsToDouble(i); }
    Object c6(int i) throws Exception { return Double.longBitsToDouble(i + 1); }
    Object c7(int i) throws Exception { return Double.longBitsToDouble(i + 1L); }
    Object c8(char c) throws Exception { return Double.longBitsToDouble(c); }
    Object c9(int i) throws Exception { return Float.intBitsToFloat(i); }
    Object c10(int x) throws Exception { return Math.min(0, Math.max(100, x)); }
    Object c11(int x) throws Exception { return Math.max(100, Math.min(0, x)); }
    Object c12(int x) throws Exception { return Math.min(100, Math.max(0, x)); }
    Object c13(int x) throws Exception { return Math.max(Math.min(x, 0), 100); }
    Object c14(int x) throws Exception { return Math.min(Math.max(x, 100), 0); }
    Object c15(int x) throws Exception { return Math.min(0, Math.max(x, 100)); }
    Object c16(long x) throws Exception { return Math.min(0L, Math.max(100L, x)); }
    Object c17(double x) throws Exception { return Math.min(0.0, Math.max(100.0, x)); }
    Object c18(float x) throws Exception { return Math.min(0f, Math.max(100f, x)); }
    Object c19(int x) throws Exception { return Math.min(5, Math.max(5, x)); }
    Object c20(int x) throws Exception { return Math.min(4, Math.max(5, x)); }
    Object c21(int x) throws Exception { return Math.max(5, Math.min(4, x)); }
    Object c22(int x) throws Exception { return Math.min(0, Math.min(100, x)); }
    Object c23(int x) throws Exception { return StrictMath.min(0, StrictMath.max(100, x)); }
    Object c24(int x) throws Exception { return Math.min(-1, Math.max(1, x)); }
    Object c25(int x) throws Exception { int y = Math.max(100, x); return Math.min(0, y); }
    Object c26(String u) throws Exception { return DriverManager.getConnection(u, "user", "secret"); }
    Object c27(String u) throws Exception { return DriverManager.getConnection(u, "user", ""); }
    Object c28(String u) throws Exception { return DriverManager.getConnection(u, "user", PW); }
    Object c29(String u) throws Exception { return DriverManager.getConnection(u, "user", fpw); }
    Object c30(String u) throws Exception { return DriverManager.getConnection(u, null, null); }
    Object c31(String u) throws Exception { return DriverManager.getConnection(u, new Properties()); }
    Object c32(String u) throws Exception { return DriverManager.getConnection(u, "user", "a" + "b"); }
    Object c33(String u, String p) throws Exception { return DriverManager.getConnection(u, "user", p); }
    Object c34(String u) throws Exception { return DriverManager.getConnection(u, "", ""); }
    Object c35(String u) throws Exception { return DriverManager.getConnection(u, "user", new String("")); }
    Object c36(Object o) throws Exception { return new File("/etc/passwd"); }
    Object c37(Object o) throws Exception { return new File("relative/x"); }
    Object c38(Object o) throws Exception { return new File("C:\\x\\y"); }
    Object c39(Object o) throws Exception { return new File("/tmp", "x"); }
    Object c40(Object o) throws Exception { return new File("x", "/tmp"); }
    Object c41(Object o) throws Exception { return new File(ROOT); }
    Object c42(Object o) throws Exception { return new File("c:/x"); }
    Object c43(Object o) throws Exception { return new File("\\\\server\\share"); }
    Object c44(Object o) throws Exception { return new File("/"); }
    Object c45(Object o) throws Exception { return new File("D:x"); }
    Object c46(Object o) throws Exception { return new FileInputStream("/etc/passwd"); }
    Object c47(Object o) throws Exception { return new FileReader("/etc/passwd"); }
    Object c48(Object o) throws Exception { return new FileOutputStream("/tmp/x"); }
    Object c49(Object o) throws Exception { return new FileWriter("/tmp/x"); }
    Object c50(Object o) throws Exception { return new RandomAccessFile("/tmp/x", "r"); }
    Object c51(Object o) throws Exception { return Paths.get("/etc/passwd"); }
    Object c52(Object o) throws Exception { return Path.of("/etc/x"); }
    Object c53(Object o) throws Exception { return new File(new File("/x"), "y"); }
    Object c54(Object o) throws Exception { return new PrintStream("/tmp/x"); }
    Object c55(Object o) throws Exception { return new File("~/x"); }
    Object c56(Object o) throws Exception { return new File("/etc" + "/x"); }
    Object c57(Object o) throws Exception { return new File(ROOT + "/x"); }
    Object c58(Object o) throws Exception { return new java.net.URI("file:/etc"); }
    Object c59(Object o) throws Exception { return new File("C:x"); }
    Object c60(Object o) throws Exception { return new File("Z:\\"); }
    Object c61(Object o) throws Exception { return new File("/a b"); }
    Object c62(Object o) throws Exception { return new File("//x"); }
    Object c63(String s) throws Exception { return s.substring(0); }
    Object c64(String s) throws Exception { return s.substring(0, s.length()); }
    Object c65(StringBuilder s) throws Exception { return s.substring(0); }
    Object c66(StringBuffer s) throws Exception { return s.substring(0); }
    Object c67(String s) throws Exception { return s.substring(1); }
    Object c68(String s) throws Exception { return s.substring(0, 2); }
    Object c69(String s) throws Exception { return "abc".substring(0); }
    Object c70(CharSequence s) throws Exception { return s.subSequence(0, s.length()); }
    Object c71(StringBuilder s) throws Exception { return s.substring(0, s.length()); }
    Object c72(String s) throws Exception { return s.trim().substring(0); }
}
