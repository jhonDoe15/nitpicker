package p;
import java.util.*;
public class Sti { private List<String> f; private Sti() { f = Collections.emptyList(); } private Sti(Object b) { } public List<String> get() { return f; } public static class Bld { public Sti build() { Sti r = new Sti(this); r.f = new ArrayList<>(); return r; }  } }
