package p;
class R2 { int t;
 class In extends Thread { }
 R2(int x){
  new In().start();
  System.out.println(t); }
}
