package p;
import java.util.*;
public class W10 implements Iterator<String> {
    boolean b;
    public boolean hasNext() { return b; }
    public String next() { return "x"; }
    public String next(int i) { return "x"; }
}
