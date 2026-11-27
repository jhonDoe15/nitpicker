package p;
import java.util.*;
public class T11 implements Iterator<String> {
    static class Mine extends NoSuchElementException {}
    public boolean hasNext() { return true; }
    public String next() { throw new Mine(); }
}
