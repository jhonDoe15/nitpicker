package c;
import java.util.*;
public class Scopes implements Cloneable {
    static int counter;
    int field;
    public Object clone() {
        class L { Object m() { return new Scopes(); } }
        return null;
    }
    public Object clone2() { return null; }
    void m(Object o, int field) {
        if (o instanceof Integer count) { }
        counter = 1;
    }
    Scopes() {
        Object o = null;
        if (o instanceof Integer counter) { }
        counter = 3;
    }
    Scopes(int x) {
        Object o = null;
        try (java.io.StringReader counter = new java.io.StringReader("")) { } catch (Exception e) { counter = 4; }
    }
    Scopes(String s) {
        int y = switch (s.length()) { case 1: int counter = 3; yield counter; default: yield 0; };
        counter = 5;
    }
    void unused(Object o) {
        int a = 1;
        if (o instanceof String a2) {}
        Runnable r = () -> { int unusedInLambda = 0; };
        class Loc { void z() { int unusedInLocal = 0; } }
    }
}
class Lonely {
    static Lonely inst;
    static Lonely getInstance() { return inst; }
    void x() { class Q { static Lonely getInstance() { return null; } } }
}
