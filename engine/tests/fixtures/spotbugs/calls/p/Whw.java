package p;
import java.util.*;
public class Whw { private List<String> f; private Whw() { f = Collections.emptyList(); } private Whw(Bld b) { } public List<String> get() { return f; } public static class Bld { public Whw build() { Whw r = new Whw((Bld) null); r.f = new ArrayList<>(); return r; }  } }
