package c;
import java.security.*;

/** doc */
@Deprecated
public class O2
    extends MessageDigest {

  private int x = 3;

  O2() {
    super("x");
  }

  protected void engineUpdate(byte b) {}
  protected void engineUpdate(byte[] b,int o,int l) {}
  protected byte[] engineDigest(){return null;}
  protected void engineReset(){}
  static class In extends java.security.MessageDigest {
    In() { super("y"); }
    protected void engineUpdate(byte b) {}
    protected void engineUpdate(byte[] b,int o,int l) {}
    protected byte[] engineDigest(){return null;}
    protected void engineReset(){}
  }
  static abstract class Em extends MessageDigest {

    Em() {
      super("e"); }
  }
  static abstract class Em2 extends MessageDigest {
    Em2(String s) { super(s); }
    Em2() { this("q"); }
  }
  void local() { class Lo extends MessageDigest { Lo() { super("l"); } protected void engineUpdate(byte b) {} protected void engineUpdate(byte[] b,int o,int l) {} protected byte[] engineDigest(){return null;} protected void engineReset(){} } }
  interface I {}
  enum E { A; }
}
