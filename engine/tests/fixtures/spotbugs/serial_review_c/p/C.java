package p;
import java.io.Serializable;
import java.util.*;
public class C implements Serializable {
    private static final long serialVersionUID = 1L;
    private List<String> xs;
    private List<String> ys;
    public C(List<String> xs) { this.xs = xs; }
    void set(List<String> ys) { this.ys = ys; }
    void set2(ArrayList<String> ys) { this.ys = ys; }
}
