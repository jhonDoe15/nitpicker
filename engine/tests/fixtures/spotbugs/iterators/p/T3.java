package p;
import java.util.*;
public class T3 implements Iterator<String> {
    Iterator<String> d;
    public boolean hasNext() { return true; }
    public String next() { return d.next(); }
}
