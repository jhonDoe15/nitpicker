package q;
public class Gen<T> {
    T t;
    @Override public boolean equals(Object o) { return o == this; }
    @Override public int hashCode() { return 1; }
}
