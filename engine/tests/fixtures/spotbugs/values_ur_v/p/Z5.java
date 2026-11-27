package p;
class Z5 { int t; int u;
 Z5(int x){
  for (int i = 0; i < 2; i++) {
   try {
    if (i == 1) break;
    t = 1;
   } finally {
    System.out.println(u);
   }
  }
 }
}
