package p;
import java.util.*;
public class Bpqesf { private List<String> f; private Bpqesf() { f = Collections.emptyList(); } private Bpqesf(Bld b) { } public List<String> get() { return f; } public static class Bld { public Bpqesf build() { Bpqesf r = new Bpqesf((Bld) null); r.f = new ArrayList<>(); return r; }  } }
