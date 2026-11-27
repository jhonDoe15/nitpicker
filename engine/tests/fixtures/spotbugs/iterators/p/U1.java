package p;
import java.util.*;
public class U1 extends Plain implements Iterator<String> {
    public boolean hasNext() { return true; }
    public String next() { return "x"; }
}
