package p;
import java.net.URL;
import java.util.*;
public class D {
    static class D1 { URL u; public boolean equals(Object o) { return u.equals(o); } public int hashCode() { return 1; } }
    static class D2 { String s; public boolean equals(Object o) { return s.equals(o); } public int hashCode() { return 1; } }
    static class D3 { Object x; public boolean equals(Object o) { return x.equals(o); } public int hashCode() { return 1; } }
    static class D4 { List<String> l; public boolean equals(Object o) { return l.equals(o); } public int hashCode() { return 1; } }
    static class D5 { Integer i; public boolean equals(Object o) { return i.equals(o); } public int hashCode() { return 1; } }
    static class D6 { URL u; public boolean equals(Object o) { return Objects.equals(u, o); } public int hashCode() { return 1; } }
    static class D7 { D7 d; public boolean equals(Object o) { return d.equals(o); } public int hashCode() { return 1; } }
    static class D8 { URL u; public boolean equals(Object o) { return o.equals(u); } public int hashCode() { return 1; } }
    static class D9 { URL u; public boolean equals(Object o) { Object x = o; return u.equals(x); } public int hashCode() { return 1; } }
    static class D10 { URL u; public boolean equals(Object o) { return o != null && u.equals(o); } public int hashCode() { return 1; } }
    static final class D11 { Runnable r; public boolean equals(Object o) { return r.equals(o); } public int hashCode() { return 1; } }
    static class D12 { Runnable r; public boolean equals(Object o) { return r.equals(o); } public int hashCode() { return 1; } }
    static class D13 { StringBuilder b; public boolean equals(Object o) { return b.equals(o); } public int hashCode() { return 1; } }
    static class D14 { URL u; String s; public boolean equals(Object o) { return u.equals(o) || s.equals(o); } public int hashCode() { return 1; } }
    static class D15 { URL u; public boolean equals(Object o) { return u.hashCode() == o.hashCode(); } public int hashCode() { return 1; } }
    static class D16 { static URL U; public boolean equals(Object o) { return U.equals(o); } public int hashCode() { return 1; } }
    static class D17 { URL u() { return null; } public boolean equals(Object o) { return u().equals(o); } public int hashCode() { return 1; } }
    static class D18 { public boolean equals(Object o) { URL u = null; return u.equals(o); } public int hashCode() { return 1; } }
    static class D19 { Thread t; public boolean equals(Object o) { return t.equals(o); } public int hashCode() { return 1; } }
    static class D20 { Date t; public boolean equals(Object o) { return t.equals(o); } public int hashCode() { return 1; } }
}
