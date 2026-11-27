package p;

public class B {
    final double d;
    B(double d) { this.d = d; }
    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof B)) return false;
        B b = (B) o;
        return d == b.d;
    }
    public boolean equals(B b) { return d == b.d; }
    @Override public int hashCode() { return Double.hashCode(d); }
    public int compareTo(B b) { return d == b.d ? 0 : d < b.d ? -1 : 1; }
    Object anon() {
        return new Object() {
            double v;
            boolean collect(double x) { return v == x; }
            @Override public boolean equals(Object o) { return v == ((B) o).d; }
        };
    }
    static class In { double z; public boolean equals(Object o) { return z == ((In) o).z; } }
}
