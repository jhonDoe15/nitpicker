package p;
import java.util.*;
public class T19 implements ListIterator<String> {
    public boolean hasNext() { return true; }
    public String next() { return "a"; }
    public boolean hasPrevious() { return false; }
    public String previous() { return "b"; }
    public int nextIndex() { return 0; }
    public int previousIndex() { return 0; }
    public void remove() {}
    public void set(String s) {}
    public void add(String s) {}
}
