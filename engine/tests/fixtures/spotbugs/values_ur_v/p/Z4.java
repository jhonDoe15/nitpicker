package p;
class Z4 { int t; int u;
 Z4(int x){
  try {
   System.out.println(u);
  } catch (RuntimeException e) {
   System.out.println(t);
  } finally {
   System.out.println(t);
  }
 }
}
