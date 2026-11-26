package p;
import java.io.File;
import java.util.*;
public class M extends File {
    M(String s) { super(s); }
    @Override public File[] listFiles() { return new File[0]; }
    static int a(M m) { return m.listFiles().length; }
    static int b(N n) { return n.listFiles().length; }
}
class N extends File {
    N(String s) { super(s); }
}
