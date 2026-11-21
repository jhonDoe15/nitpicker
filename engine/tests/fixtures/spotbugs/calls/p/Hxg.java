package p;
import java.util.*;
public class Hxg { private List<String> f; private Hxg() { f = Collections.emptyList(); } private Hxg(Bld b) { } public List<String> get() { return f; } public static class Bld { public Hxg build() { Hxg r = new Hxg(); r.f = new ArrayList<>(); return r; } public Hxg other() { return new Hxg((Bld) null); } } }
