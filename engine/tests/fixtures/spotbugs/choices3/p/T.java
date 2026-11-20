package p;
import java.util.*;
public class T {
    public static class T1 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of() : List.copyOf(p); }
        public List<String> g() { return f; } }
    public static class T2 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = p == null ? Collections.emptyList() : List.copyOf(p); }
        public List<String> g() { return f; } }
    public static class T3 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of() : List.of(a); }
        public List<String> g() { return f; } }
    public static class T4 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.unmodifiableList(List.of(a)); }
        public List<String> g() { return f; } }
    public static class T5 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : List.copyOf(List.of(a)); }
        public List<String> g() { return f; } }
    public static class T6 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { List<String> x = new ArrayList<>(); f = c ? Collections.emptyList() : Collections.unmodifiableList(x); }
        public List<String> g() { return f; } }
    public static class T7 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of() : List.copyOf(other); }
        public List<String> g() { return f; } }
    public static class T8 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of(a) : List.copyOf(p); }
        public List<String> g() { return f; } }
    public static class T9 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.copyOf(other) : Collections.unmodifiableList(p); }
        public List<String> g() { return f; } }
    public static class T10 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.unmodifiableList(p) : List.copyOf(p); }
        public List<String> g() { return f; } }
    public static class T11 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : mine(); }
        public List<String> g() { return f; } }
    public static class T12 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : mine2(); }
        public List<String> g() { return f; } }
    public static class T13 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.singletonList(p.get(0)); }
        public List<String> g() { return f; } }
    public static class T14 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : List.of(p.get(0)); }
        public List<String> g() { return f; } }
    public static class T15 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : List.of(a, a); }
        public List<String> g() { return f; } }
    public static class T16 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : nul(); }
        public List<String> g() { return f; } }
    public static class T17 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.unmodifiableList(p); }
        public List<String> g() { return f; } }
    public static class T18 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.singletonList(a) : Collections.unmodifiableList(p); }
        public List<String> g() { return f; } }
    public static class T19 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of() : Collections.emptyList(); }
        public List<String> g() { return f; } }
    public static class T20 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.synchronizedList(p); }
        public List<String> g() { return f; } }
    public static class T21 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.unmodifiableList(p) : Collections.synchronizedList(p); }
        public List<String> g() { return f; } }
    public static class T22 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.copyOf(p) : List.of(); }
        public List<String> g() { return f; } }
    public static class T23 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of() : List.copyOf(mine()); }
        public List<String> g() { return f; } }
    public static class T24 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of() : new ArrayList<>(p); }
        public List<String> g() { return f; } }
    public static class T25 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of() : mine2(); }
        public List<String> g() { return f; } }
    public static class T26 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { if (c) { f = List.of(); return; } f = List.copyOf(p); }
        public List<String> g() { return f; } }
    public static class T27 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { List<String> x; if (c) { x = Collections.emptyList(); } else { x = Collections.unmodifiableList(p); } f = x; }
        public List<String> g() { return f; } }
    public static class T28 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { List<String> x = Collections.emptyList(); if (c) { x = Collections.unmodifiableList(p); } f = x; }
        public List<String> g() { return f; } }
    public static class T29 { private List<String> f; private List<String> other; List<String> mine() { return new ArrayList<>(); } List<String> mine2() { return other; } static List<String> nul() { return null; }
        public void s(List<String> p, boolean c, String a, byte[] b) { List<String> x = p; if (c) { x = Collections.emptyList(); } f = x; }
        public List<String> g() { return f; } }
}
