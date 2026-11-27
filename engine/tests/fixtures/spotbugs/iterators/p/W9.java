package p;
import java.util.*;
public class W9 implements Iterator<String> {
    boolean b;
    public boolean hasNext() { if (b) return true; return true; }
    public String next() { return "x"; }
}
