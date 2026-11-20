package p;
public class Tn {
    final static Tn EMPTY = new Tn("");
    private static final Tn PRIV = new Tn("");
    protected final String v;
    public Tn(String v) { this.v = v; }
    public static Tn valueOf(String v) { if (v == null) return null; if (v.isEmpty()) return EMPTY; return new Tn(v); }
    public static Tn priv() { return PRIV; }
    public void remove() { }
}
