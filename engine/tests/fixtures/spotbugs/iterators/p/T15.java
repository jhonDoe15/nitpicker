package p;
import java.util.*;
public class T15 implements Iterator<String> {
    public boolean hasNext() { return true; }
    public String next() { hasNext(); return "x"; }
}
