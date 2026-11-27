package c;
import java.security.*;
import java.util.Random;
import javax.crypto.*;
import javax.crypto.spec.*;
public class K3 {
  static final int SIZE = 512;
  SecureRandom r = new SecureRandom();
  KeyPairGenerator fg;
  KeyGenerator fk;
  void r1() throws Exception { KeyPairGenerator.getInstance("RSA").initialize(512, new SecureRandom()); }
  void r2() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(512);
    g.initialize(256); }
  void r3() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("DSA"); KeyPairGenerator h = KeyPairGenerator.getInstance("RSA"); g.initialize(512); }
  void r4a() throws Exception { fg = KeyPairGenerator.getInstance("RSA"); }
  void r4b() throws Exception { fg.initialize(512); }
  void r5(KeyPairGenerator g) throws Exception { g.initialize(512); KeyPairGenerator.getInstance("RSA"); }
  void r6() throws Exception { String a = "RSA"; KeyPairGenerator g = KeyPairGenerator.getInstance(a); g.initialize(512); }
  void r7() throws Exception { final int n = 512; KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(n); }
  void r8() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(256 * 2); }
  void r9() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(SIZE); }
  void r10() throws Exception {
    KeyPairGenerator g = KeyPairGenerator.getInstance("RSA");
    g.initialize(
      512);
  }
  void r11(boolean b) throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("DSA"); if (b) { g = KeyPairGenerator.getInstance("RSA"); } g.initialize(512); }
  void r12() throws Exception { KeyPairGenerator g; (g = KeyPairGenerator.getInstance("RSA")).initialize(512); }
  void r13() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("DSA", "RSA"); g.initialize(512); }
  void r14() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); int x = 1; g.initialize(512); }
  void r15() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(0); }
  void r16() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA"); g.initialize(-1); }
  void r17() throws Exception { KeyPairGenerator g = KeyPairGenerator.getInstance("RSA", Security.getProvider("BC")); g.initialize(512); }
  void b7() throws Exception {
    KeyGenerator k = KeyGenerator.getInstance("Blowfish");
    k.init(
      64);
  }
  void b8(KeyGenerator k) throws Exception { k.init(64); KeyGenerator.getInstance("Blowfish"); }
  void b9() throws Exception { String a = "Blowfish"; KeyGenerator k = KeyGenerator.getInstance(a); k.init(64); }
  void b10() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(SIZE / 8); }
  void b11() throws Exception { KeyGenerator k = KeyGenerator.getInstance("AES", "Blowfish"); k.init(64); }
  void b12() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish", Security.getProvider("BC")); k.init(64); }
  void b13a() throws Exception { fk = KeyGenerator.getInstance("Blowfish"); }
  void b13b() throws Exception { fk.init(64); }
  void b14() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(64); k.init(32); }
  void b15() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(new SecureRandom()); }
  void b16() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); int x = 1; k.init(64); }
  void b17() throws Exception { KeyGenerator k = KeyGenerator.getInstance("Blowfish"); k.init(0); }
  void s1(Cipher c) throws Exception { byte[] iv = c.getIV(); new IvParameterSpec(iv); }
  void s2() throws Exception { new IvParameterSpec(iv()); }
  byte[] iv() { return new byte[16]; }
  byte[] getIV() { return new byte[16]; }
  void s3() throws Exception { new IvParameterSpec(getIV()); }
  void s4(IvParameterSpec p) throws Exception { new IvParameterSpec(p.getIV()); }
  void s5(byte[] x) throws Exception { new IvParameterSpec(java.util.Arrays.copyOf(x, 16)); }
  void s6(boolean b) throws Exception { byte[] iv = new byte[16]; if (b) r.nextBytes(iv); new IvParameterSpec(iv); }
  void s7() throws Exception { byte[] iv = new byte[16]; Runnable q = () -> r.nextBytes(iv); new IvParameterSpec(iv); }
  static class MyRandom extends SecureRandom { }
  void s8() throws Exception { byte[] iv = new byte[16]; new MyRandom().nextBytes(iv); new IvParameterSpec(iv); }
  Random rr = new SecureRandom();
  void s9() throws Exception { byte[] iv = new byte[16]; rr.nextBytes(iv); new IvParameterSpec(iv); }
  void fill(byte[] iv) { r.nextBytes(iv); }
  void s10() throws Exception { byte[] iv = new byte[16]; fill(iv); new IvParameterSpec(iv); }
  IvParameterSpec s11 = new IvParameterSpec(new byte[16]);
  static class MyIv extends IvParameterSpec { MyIv() { super(new byte[16]); } }
  void s13() throws Exception {
    new IvParameterSpec(
      new byte[16]);
  }
  void s14() throws Exception { new IvParameterSpec(new byte[1]);
    new IvParameterSpec(new byte[2]); }
  void s15(Cipher c) throws Exception { new IvParameterSpec(c.getParameters().getEncoded()); }
  void s16(java.nio.ByteBuffer b) throws Exception { new IvParameterSpec(b.array()); }
  void s17(Cipher c) throws Exception { byte[] iv = new byte[16]; for (int i = 0; i < 2; i++) { new IvParameterSpec(iv); r.nextBytes(iv); } }
  void s18() throws Exception { byte[] iv = new byte[16]; r.nextBytes(iv); Runnable q = () -> new IvParameterSpec(iv); }
  void s19(Cipher c) throws Exception { new IvParameterSpec(c.getIV(), 0, 8); }
  void s20(Cipher c) throws Exception { byte[] iv = c.getIV(); byte[] z = new byte[2]; new IvParameterSpec(z); }
  void s21(AlgorithmParameters p) throws Exception { new IvParameterSpec(p.getEncoded()); }
}
