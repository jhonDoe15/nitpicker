package q;
public abstract class AbstractEqBase {
    @Override public boolean equals(Object o) { return o == this; }
    @Override public int hashCode() { return 1; }
}
