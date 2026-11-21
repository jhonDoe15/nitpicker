package p;
import java.util.*;
public class Urzjrd { private List<String> f; private Urzjrd() { f = Collections.emptyList(); } private Urzjrd(Object b) { } static Urzjrd mk() { return new Urzjrd("x"); } public List<String> get() { return f; } public static class Bld { public Urzjrd build() { Urzjrd r = new Urzjrd(); r.f = new ArrayList<>(); return r; }  } }
