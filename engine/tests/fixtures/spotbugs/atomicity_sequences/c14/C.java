package c14;
class C {
 java.util.concurrent.CopyOnWriteArrayList<String> l;
 void a(String k) {
  if (!l.contains(k)) {
   l.add(k);
  }
 }
}
