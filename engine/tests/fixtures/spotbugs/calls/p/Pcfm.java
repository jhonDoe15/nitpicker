package p;
import java.util.*;
public class Pcfm { private List<String> f; private Pcfm() { f = Collections.emptyList(); } private Pcfm(Object b) { } public List<String> get() { return f; } public static class Bld { public Pcfm build() { Pcfm r = new Pcfm(this); r.f = new ArrayList<>(); return r; }  } }
