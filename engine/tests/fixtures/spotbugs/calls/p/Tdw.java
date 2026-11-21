package p;
import java.util.*;
public class Tdw { private List<String> f; private Tdw() { f = Collections.emptyList(); } private Tdw(int b) { } public List<String> get() { return f; } public static class Bld { public Tdw build() { Tdw r = new Tdw(1); r.f = new ArrayList<>(); return r; }  } }
