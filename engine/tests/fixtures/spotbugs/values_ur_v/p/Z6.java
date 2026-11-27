package p;
class Z6 { int t; String s;
 Z6(int x) throws Exception {
  try (java.io.StringReader r = new java.io.StringReader("")) {
   t = 1;
  } catch (Exception e) {
   System.out.println(t); System.out.println(s);
  } finally {
   System.out.println(s);
  }
 }
}
