package c;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.*;
public class K5 {
  SecureRandom r = new SecureRandom();
  void p1() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("DSA"); g.initialize(512, r); }
  void p2(KeyPairGenerator g) throws Exception { g.initialize(512, r); }
  void p5() throws Exception { ((KeyPairGenerator) KeyPairGenerator.getInstance("RSA")).initialize(512); }
  void p6() throws Exception { KeyPairGenerator.getInstance("RSA").initialize(512);
    KeyPairGenerator.getInstance("RSA").initialize(512); }
  void p12() throws Exception { Runnable q = () -> { try { KeyPairGenerator.getInstance("RSA"); } catch (Exception e) { } }; KeyPairGenerator.getInstance("DSA").initialize(512); }
  void p14() throws Exception { KeyPairGenerator.getInstance("RSA", "BC").initialize(512); }
  void p15() throws Exception { KeyPairGenerator g = null; try { g = KeyPairGenerator.getInstance("RSA"); } catch (RuntimeException e) { } g.initialize(512); }
  void p16() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(512, r);
    g.initialize(256, r); }
  void q1() throws Exception { Cipher.getInstance("Blowfish"); KeyGenerator.getInstance("AES").init(64); }
  void foo(String s) { }
  void q2() throws Exception { foo("Blowfish"); KeyGenerator.getInstance("AES").init(64); }
  void q3(KeyGenerator k) throws Exception { k.init(64, r); KeyGenerator.getInstance("Blowfish"); }
  void q4() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(64);
    k.init(32); }
  void q5() throws Exception { Runnable q = () -> { try { KeyGenerator.getInstance("Blowfish"); } catch (Exception e) { } }; KeyGenerator.getInstance("AES").init(64); }
  void q6() throws Exception { KeyGenerator.getInstance("Blowfish"); KeyPairGenerator.getInstance("RSA").initialize(64); }
  void q7() throws Exception { KeyGenerator.getInstance("Blowfish"); KeyGenerator.getInstance("AES").init(64); KeyGenerator.getInstance("Blowfish"); }
  void t1(Cipher c) throws Exception { new IvParameterSpec(new byte[1]); c.getIV(); }
  void t2() throws Exception { getIV(); new IvParameterSpec(new byte[1]); }
  byte[] getIV() { return null; }
  void t3(SecureRandom s) throws Exception { byte[] iv = new byte[16]; s.nextBytes(iv); new IvParameterSpec(iv); }
  void t4() throws Exception { byte[] iv = new byte[16]; try { r.nextBytes(iv); new IvParameterSpec(iv); } catch (RuntimeException e) { } }
  void t5(int x) throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv); while (x-- > 0) { new IvParameterSpec(iv); } }
  void t6() throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv); try { iv.clone(); } catch (RuntimeException e) { new IvParameterSpec(iv); } }
  void t7(int x) throws Exception { byte[] iv = new byte[16]; switch (x) { case 1: r.nextBytes(iv); break; default: r.nextBytes(iv); } new IvParameterSpec(iv); }
  void t8(boolean b) throws Exception { byte[] iv = new byte[16]; if (b) return; r.nextBytes(iv); new IvParameterSpec(iv); }
  void t9(int x) throws Exception { byte[] iv = new byte[16]; do { r.nextBytes(iv); new IvParameterSpec(iv); } while (x-- > 0); }
  void t10(Cipher c) throws Exception { Runnable q = () -> c.getIV(); new IvParameterSpec(new byte[1]); }
  void t11(Cipher c, int x) throws Exception { for (int i = 0; i < x; i++) { new IvParameterSpec(new byte[1]); c.getIV(); } }
  void t12(boolean b) throws Exception { byte[] iv = new byte[16]; if (b) { r.nextBytes(iv); } else { throw new RuntimeException(); } new IvParameterSpec(iv); }
}
