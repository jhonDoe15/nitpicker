package p;
class Z7 { int t;
 Z7(int x){
  try {
   System.out.println(1);
  } finally {
   t = 1;
  }
  System.out.println(t);
 }
}
