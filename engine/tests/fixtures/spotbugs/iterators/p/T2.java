package p;
import java.util.*;
public class T2 implements Iterator<String> {
    public boolean hasNext() { return true; }
    public String next() { if (!hasNext()) throw new NoSuchElementException(); return "x"; }
}
