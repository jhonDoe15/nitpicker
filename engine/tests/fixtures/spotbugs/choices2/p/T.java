package p;
import java.util.*;
public class T {
    static List<String> call() { return null; } static List<String> call2(List<String> p) { return p; }
    public static class T1 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = Collections.unmodifiableList(new ArrayList<>(p)); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T2 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.unmodifiableList(new ArrayList<>(p)); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T3 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = p == null ? List.of() : List.copyOf(p); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T4 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of() : Collections.unmodifiableList(p); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T5 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = p == null ? Collections.emptyList() : Collections.unmodifiableList(p); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T6 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.unmodifiableList(p); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T7 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.unmodifiableList(other); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T8 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : List.copyOf(p); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T9 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.unmodifiableList(call()); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T10 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : call2(p); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T11 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : List.of(a); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T12 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { arr = c ? new byte[0] : b; }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T13 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { arr = b == null ? new byte[0] : b; }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T14 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : this.other; }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T15 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.copyOf(p) : Collections.emptyList(); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T16 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? call2(p) : Collections.emptyList(); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T17 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.unmodifiableList(new ArrayList<>(p)) : Collections.emptyList(); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T18 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? other : Collections.emptyList(); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T19 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? call() : Collections.emptyList(); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T20 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { arr = c ? b : new byte[0]; }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T21 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : (a == null ? Collections.emptyList() : p); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T22 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.singletonList(a); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T23 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : new ArrayList<>(p); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T24 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { List<String> x = p; f = c ? Collections.emptyList() : x; }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T25 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { List<String> x = new ArrayList<>(); f = c ? Collections.emptyList() : x; }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T26 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.unmodifiableList(Arrays.asList(a)); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T27 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = Collections.unmodifiableList(call2(p)); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T28 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of() : Collections.unmodifiableList(call2(p)); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T29 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { arr = c ? new byte[0] : other2; }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T30 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.unmodifiableList(p) : Collections.unmodifiableList(other); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T31 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.unmodifiableList(p) : Collections.unmodifiableList(p); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T32 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? List.of(a) : List.of(); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T33 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { if (c) { f = Collections.emptyList(); } else { f = Collections.unmodifiableList(new ArrayList<>(p)); } }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T34 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { List<String> x = new ArrayList<>(p); f = Collections.unmodifiableList(x); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
    public static class T35 { private List<String> f; private List<String> other; private byte[] arr; private byte[] other2;
        public void s(List<String> p, boolean c, String a, byte[] b) { f = c ? Collections.emptyList() : Collections.unmodifiableList(p.subList(0, 1)); }
        public List<String> g() { return f; } public byte[] h() { return arr; } }
}
