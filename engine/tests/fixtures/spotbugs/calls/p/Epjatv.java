package p;
import java.util.*;
public class Epjatv { private List<String> f; private Epjatv() { f = Collections.emptyList(); } private Epjatv(int b) { } public List<String> get() { return f; } public static class Bld { public Epjatv build() { Epjatv r = new Epjatv(); r.f = new ArrayList<>(); return r; }  } }
