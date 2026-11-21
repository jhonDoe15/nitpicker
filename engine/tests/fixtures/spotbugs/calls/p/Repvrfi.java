package p;
import java.util.*;
public class Repvrfi { private List<String> f; private Repvrfi() { f = Collections.emptyList(); } private Repvrfi(String b) { } public List<String> get() { return f; } public static class Bld { public Repvrfi build() { Repvrfi r = new Repvrfi("x"); r.f = new ArrayList<>(); return r; }  } }
