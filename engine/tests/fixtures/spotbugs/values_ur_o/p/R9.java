package p;
class R9 { int t;
 R9(int x){
  new Thread(){ }.start();
  new Thread(){ }.start();
  System.out.println(t); }
}
