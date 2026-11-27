package p;
class R5 { int t;
 static class S extends Thread { }
 R5(int x){
  new S().start();
  System.out.println(t); }
}
