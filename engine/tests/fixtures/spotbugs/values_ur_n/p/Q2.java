package p;
class Q2 { int t;
 Q2(int x){
  Object r = new Object(){ void foo(){ System.out.println(t); } };
  System.out.println(t); }
}
