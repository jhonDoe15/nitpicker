package p;
import java.util.*;
public class T22 implements Iterator<String> {
    Iterator<String> d;
    public boolean hasNext() { return true; }
    public String next() { return other(); }
    String other() { return d.next(); }
}
