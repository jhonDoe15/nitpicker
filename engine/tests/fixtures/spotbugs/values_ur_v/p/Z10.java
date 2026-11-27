package p;
class Z10 { int t; int u;
 Z10(int x){
  synchronized (this) { if (x > 0) return; u = 1; }
  System.out.println(u);
  System.out.println(t);
 }
}
