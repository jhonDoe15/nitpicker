package p;
import java.util.*;
public class T4 implements Iterator<String> {
    public boolean hasNext() { return true; }
    public String next() { return helper(); }
    String helper() { throw new NoSuchElementException(); }
}
