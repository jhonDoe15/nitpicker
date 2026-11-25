package p;
import java.util.*;
public class Fgsj { private List<String> f; private Fgsj() { f = Collections.emptyList(); } private Fgsj(Object b) { } public List<String> get() { return f; } public static class Bld { public Fgsj build() { Fgsj r = new Fgsj(this); r.f = new ArrayList<>(); return r; }  } }
