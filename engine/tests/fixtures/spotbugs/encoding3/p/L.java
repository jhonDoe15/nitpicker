package p;
import java.io.*;
public class L {
    enum E1 { X(new String(new byte[1])); E1(String s) {} }
    enum E2 { X { void f() { new String(new byte[1]); } }; void f() {} }
    enum E3 { X; String s = new String(new byte[1]); }
    enum E4 { X; static String s = new String(new byte[1]); }
    enum E5 { X("a".getBytes().toString()), Y; E5() {} E5(String s) {} }
    record R(String s) { R { new String(new byte[1]); } static String q = new String(new byte[1]); }
    interface I { default void f() { "x".getBytes(); } static void g() { "x".getBytes(); } }
    void m() { class Loc { void z() { "x".getBytes(); } } Object o = new Object() { { "y".getBytes(); } }; }
    static { "s".getBytes(); }
    { "i".getBytes(); }
    L() {}
    L(int x) {}
}
