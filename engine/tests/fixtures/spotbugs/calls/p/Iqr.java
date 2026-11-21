package p;
import java.util.*;
public class Iqr { private List<String> f; private Iqr() { f = Collections.emptyList(); } private Iqr(Bld b) { f = Collections.emptyList(); } public List<String> get() { return f; } public static class Bld { public Iqr build() { Iqr r = new Iqr(this); r.f = new ArrayList<>(); return r; }  } }
