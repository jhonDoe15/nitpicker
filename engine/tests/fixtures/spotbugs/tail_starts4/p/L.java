package p;
public class L {
  Thread m = new Thread();
  public L() { for (;;) { m.start(); break; } }
  public L(int a) { while (true) { m.start(); break; } }
  public L(long a) { do { m.start(); } while (false); }
  public L(char a) { for (int i=0;i<2;i++) { m.start(); } }
  public L(byte a) { while (a>0) { m.start(); a--; } }
  public L(short a) { if (a>0) { m.start(); } else { return; } }
  public L(float a) { }
  public L(double a) { l: for(;;) { m.start(); break l; } }
  public L(String a) { try { m.start(); } catch (Exception e) { } }
  public L(Object a) { if (a==null) { m.start(); } }
  public L(Number a) { if (a==null) { m.start(); } else { m.start(); } }
  public L(Integer a) { { m.start(); } ; }
  public L(Long a) { synchronized(this) { } m.start(); }
  public L(Short a) { m.start(); synchronized(this) { } }
}
