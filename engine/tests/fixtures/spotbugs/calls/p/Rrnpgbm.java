package p;
import java.util.*;
public class Rrnpgbm { private List<String> f; private Rrnpgbm() { f = Collections.emptyList(); } private Rrnpgbm(Object b) { } static Rrnpgbm mk() { return new Rrnpgbm("x"); } public List<String> get() { return f; } public static class Bld { public Rrnpgbm build() { Rrnpgbm r = new Rrnpgbm(); r.f = new ArrayList<>(); return r; }  } }
