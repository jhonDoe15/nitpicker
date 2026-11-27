package p;

import java.util.*;

public enum A {
    X, Y;
    int count;
    public String value;
    private String priv;
    final int[] arr = new int[2];
    public final int[] parr = new int[2];
    public final List<String> list = new ArrayList<>();
    public final String name2 = "x";
    public static int shared;
    protected Date date;
    int pkg;

    public void setValue(String v) { value = v; }
    public void setCount(int c) { this.count = c; }
    void setPriv(String p) { priv = p; }
    private void setPkg(int p) { pkg = p; }
    public void maybe(int c) { if (c > 0) count = c; }
    public static void setShared(int s) { shared = s; }
    public void two(String a, String b) { value = a; priv = b; }
    public void bump() { count++; }
    public void fromCall() { value = toString(); }
    public void setDate(Date d) { this.date = d; }
    public String getPriv() { return priv; }
}
enum B {
    P;
    public int x;
    private int y;
    public void set(int v) { y = v; }
    public int get() { return y; }
}
enum C {
    Q { public void set(int v) { z = v; } };
    int z;
    public void set(int v) { z = v; }
}
