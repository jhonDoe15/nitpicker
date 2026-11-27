package p;
public class E2 {
  enum Hid { A; public int pub; public void s(int a){ pub = a; } }
  public enum Pub { A; public int pub; public void s(int a){ pub = a; } }
  protected enum Prot { A; public int pub; public void s(int a){ pub = a; } }
  interface I { enum N { A; public int pub; public void s(int a){ pub = a; } } }
  public interface J { enum N2 { A; public int pub; public void s(int a){ pub = a; } } }
}
enum E3 { A; public int pub; public void s(int a){ pub = a; } }
