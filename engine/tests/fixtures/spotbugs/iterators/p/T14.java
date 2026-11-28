package p;
import java.util.*;
public class T14 implements Iterator<String> {
    String x;
    public boolean hasNext() { return true; }
    public String next() { return Objects.requireNonNull(x); }
}
