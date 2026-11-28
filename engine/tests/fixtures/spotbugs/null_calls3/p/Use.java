package p;
public class Use {
    static int len(String s) { return s.length(); }
    static int keep(String s) { return s == null ? 0 : 1; }
    static int size(String[] a) { return a.length; }
    static int count(String[] a) { return size(a) + 1; }
    static int via(String s) { return len(s) + 1; }
}
