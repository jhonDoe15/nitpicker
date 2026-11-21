package p;
import java.util.*;
public class Uairwac { private List<String> f; private Uairwac() { f = Collections.emptyList(); } private Uairwac(Bld b) { } public List<String> get() { return f; } public static class Bld { public Uairwac build() { Uairwac r = new Uairwac(); r.f = new ArrayList<>(); return r; } public Uairwac other() { return new Uairwac((Bld) null); } } }
