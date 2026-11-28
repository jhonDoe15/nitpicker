package p;
import java.io.File;
import java.util.*;
public class D {
    static int d1(String s) {
        if (s == null) {
            System.out.println();
        }
        return Use.len(s);
    }
    static int d2(String s) {
        if (s == null) {
            System.out.println();
        }
        return Integer.parseInt(s);
    }
    static int d3(File f) {
        return Use.len(f.getParent());
    }
    static int d4(File f) {
        return Use.via(f.getParent());
    }
    static int o1(Base b) {
        Object s = b.v();
        int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n;
    }
    static int o2(Lone b) {
        Object s = b.v();
        int n = s == null ? 0 : s.hashCode();
        return s.hashCode() + n;
    }
    static int d5(File f, boolean b) {
        String p = f.getParent();
        if (b) {
            return Use.len(p);
        }
        return p.length();
    }
    static int d6(File f, boolean b) {
        String p = f.getParent();
        if (b) {
            return Integer.parseInt(p);
        }
        return p.length();
    }
    static int d7(File f, boolean b) {
        String p = f.getParent();
        if (b) {
            return Use.via(p);
        }
        return p.length();
    }
    static int d8(File f, boolean b) {
        String p = f.getParent();
        if (b) {
            return Use.keep(p);
        }
        return p.length();
    }
    static int e1(String s, boolean b) {
        if (s == null) {
            System.out.println();
        }
        if (b) {
            return Use.len(s);
        }
        return s.length();
    }
    static int e2(String s, boolean b) {
        if (s == null) {
            System.out.println();
        }
        if (b) {
            return Integer.parseInt(s);
        }
        return s.length();
    }
    static int e3(String s, boolean b) {
        if (s == null) {
            System.out.println();
        }
        if (b) {
            return Use.via(s);
        }
        return s.length();
    }
    static int e4(String s, boolean b) {
        if (s == null) {
            System.out.println();
        }
        if (b) {
            return Use.keep(s);
        }
        return s.length();
    }
    static List<String> d9(File f) {
        return Arrays.asList(f.list());
    }
    static int d10(File f) {
        return Use.size(f.list());
    }
    static int d11(File f) {
        return Use.count(f.list());
    }
}
