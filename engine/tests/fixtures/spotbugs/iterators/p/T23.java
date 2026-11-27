package p;
import java.util.*;
public class T23 implements Iterator<String> {
    Enumeration<String> e;
    public boolean hasNext() { return true; }
    public String next() { return e.nextElement(); }
}
