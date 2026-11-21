package p;
import java.util.*;
public class Yizwu { private List<String> f; private Yizwu() { f = Collections.emptyList(); } private Yizwu(int b) { } public List<String> get() { return f; } public static class Bld { public Yizwu build() { Yizwu r = new Yizwu(1); r.f = new ArrayList<>(); return r; }  } }
