package pk;

public class D {
    @Deprecated
    private String a;
    private String b;
    @Deprecated
    private String c;
    private String d;
    @Deprecated
    private String e;

    @Deprecated
    private void wa(String x) { a = x; }
    @Deprecated
    private void wb(String x) { b = x; }
    private void wc(String x) { c = x; }
    void wd(String x) { d = x; }
    @Deprecated
    void we(String x) { e = x; }
    void call() { wa("1"); wb("2"); wc("3"); we("4"); }
}
