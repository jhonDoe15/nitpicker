package p;
import java.util.*;
public class Vvr { private List<String> f; private Vvr() { f = Collections.emptyList(); } public Vvr(Bld b) { } public List<String> get() { return f; } public static class Bld { public Vvr build() { Vvr r = new Vvr(this); r.f = new ArrayList<>(); return r; }  } }
