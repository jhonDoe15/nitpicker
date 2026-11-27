package p;

public class D {
    final double d;
    double n;
    D(double d) { this.d = d; }
    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof D)) return false;
        D x = (D) o;
        return d == x.d;
    }
    public boolean e1(Object o) { D x = (D) o; return d == x.d; }
    public boolean e2(Object o) { D x = (D) o; return n == x.n; }
    public boolean e3(Object o) { if (!(o instanceof D)) return false; D x = (D) o; return n == x.n; }
    public boolean e4(Object o) { if (this == o) return true; D x = (D) o; return n == x.n; }
    public boolean e5(D x) { return d == x.d; }
    public boolean e6(D x) { return n == x.n; }
}
