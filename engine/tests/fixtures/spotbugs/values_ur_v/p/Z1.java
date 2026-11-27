package p;
class Z1 { int t;
 Z1(int x){
  try {
   if (x > 0) return;
   t = 1;
  } finally {
   System.out.println(t);
  }
 }
}
