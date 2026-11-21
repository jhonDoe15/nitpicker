package p;
import java.util.*;
public class Firedv { private List<String> f; private Firedv() { f = Collections.emptyList(); } private Firedv(Bld b) { } public List<String> get() { return f; } public static class Bld { public Firedv build() { Firedv r = new Firedv(); r.f = new ArrayList<>(); return r; } public Firedv other() { return new Firedv((Bld) null); } } }
