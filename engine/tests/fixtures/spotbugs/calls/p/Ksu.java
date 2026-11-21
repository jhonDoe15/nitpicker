package p;
import java.util.*;
public class Ksu { private List<String> f; private Ksu() { f = Collections.emptyList(); } private Ksu(Bld b) { } public List<String> get() { return f; } public static class Bld { public Ksu build() { Ksu r = new Ksu((Bld) null); r.f = new ArrayList<>(); return r; }  } }
