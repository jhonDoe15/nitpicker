package p;
import java.util.*;
public class Weygidg { private List<String> f; private Weygidg() { f = Collections.emptyList(); } private Weygidg(Object b) { } static Weygidg mk() { return new Weygidg("x"); } public List<String> get() { return f; } public static class Bld { public Weygidg build() { Weygidg r = new Weygidg(); r.f = new ArrayList<>(); return r; }  } }
