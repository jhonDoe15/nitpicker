package p;
import java.util.*;
public class Ybu { private List<String> f; private Ybu() { f = Collections.emptyList(); } public Ybu(Bld b) { } public List<String> get() { return f; } public static class Bld { public Ybu build() { Ybu r = new Ybu(this); r.f = new ArrayList<>(); return r; }  } }
