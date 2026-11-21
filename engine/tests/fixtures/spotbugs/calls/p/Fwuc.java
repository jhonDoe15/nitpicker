package p;
import java.util.*;
public class Fwuc { private List<String> f; private Fwuc() { f = Collections.emptyList(); } private Fwuc(Bld b) { f = Collections.emptyList(); } public List<String> get() { return f; } public static class Bld { public Fwuc build() { Fwuc r = new Fwuc(this); r.f = new ArrayList<>(); return r; }  } }
