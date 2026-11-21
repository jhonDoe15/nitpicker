package p;
import java.util.*;
public class Uvat { private List<String> f; private Uvat() { f = Collections.emptyList(); } private Uvat(int b) { } public List<String> get() { return f; } public static class Bld { public Uvat build() { Uvat r = new Uvat(); r.f = new ArrayList<>(); return r; }  } }
