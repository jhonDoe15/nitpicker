package p;
import java.util.*;
public class V6 {
    private List<String> f; private List<String> other; static List<String> call() { return null; }
    public void s(List<String> p, boolean c) { f = c ? Collections.unmodifiableList(p) : List.of(); }
    public List<String> g() { return f; }
}
