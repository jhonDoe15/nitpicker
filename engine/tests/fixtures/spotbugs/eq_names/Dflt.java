public class Dflt extends q.Base { int f; 
  public static class N implements Comparable<N> { public int compareTo(N o){return 0;} }
  public static class E { int x; public boolean equals(Object o){ return ((E)o).x==x; } public int hashCode(){return 1;} }
}
class DBase { public boolean equals(Object o){return o==this;} public int hashCode(){return 1;} }
class DSub extends DBase { int f; }
