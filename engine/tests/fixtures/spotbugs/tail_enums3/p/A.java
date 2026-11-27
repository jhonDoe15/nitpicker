package p;

public enum A {
    X { public void body(String v) { s = v; } }, Y;
    public String s;
    String t;
    static class Other { String o; }
    public void constLocal() { String w = "c"; s = w; }
    public void after(String v, boolean b) { s = v; if (b) System.out.println(); }
    protected void prot(String v) { s = v; }
    public void otherClass(Other o, String v) { o.o = v; }
    public void sw(String v, int k) { switch (k) { case 1: System.out.println(); break; default: } t = v; }
    public void andAnd(String v, boolean a, boolean b) { boolean c = a && b; t = v; }
    public void tern(String v, boolean a) { String u = a ? v : null; t = v; }
    public void catchIt(String v) { try { System.out.println(); } catch (RuntimeException e) { } t = v; }
    public void field2(A a) { t = a.t; }
    public void thisCall(String v) { this.t = v; }
    public void param2(String v, String w) { t = w; }
    public void boxing(Integer v) { t = String.valueOf(v); }
    public void castIt(Object v) { t = (String) v; }
    public void nul() { t = null; }
    public void self() { t = t; }
    public void reassigned(String v) { v = "z"; t = v; }
    public void arr(String[] v) { s = v.length > 0 ? null : null; }
    public void multiline(String v) {
        t =
            v;
    }
}
