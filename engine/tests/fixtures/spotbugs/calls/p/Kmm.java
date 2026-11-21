package p;
import java.util.*;
public class Kmm { private List<String> f; private Kmm() { f = Collections.emptyList(); } private Kmm(Object b) { } static Kmm mk() { return new Kmm("x"); } public List<String> get() { return f; } public static class Bld { public Kmm build() { Kmm r = new Kmm(); r.f = new ArrayList<>(); return r; }  } }
