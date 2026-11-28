package p;
import java.util.*;
public class T18 implements Iterator<String> {
    Iterator<String> d;
    public boolean hasNext() { return true; }
    public String next() { try { return "a"; } catch (RuntimeException e) { throw new NoSuchElementException(); } }
}
