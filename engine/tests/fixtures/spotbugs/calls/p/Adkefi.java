package p;
import java.util.*;
public class Adkefi { private List<String> f; private Adkefi() { f = Collections.emptyList(); } private Adkefi(int b) { } public List<String> get() { return f; } public static class Bld { public Adkefi build() { Adkefi r = new Adkefi(1); r.f = new ArrayList<>(); return r; }  } }
