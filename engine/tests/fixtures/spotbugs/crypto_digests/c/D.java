package c;
import java.security.*;
import org.apache.commons.codec.digest.DigestUtils;
public class D {
  static final String M = "MD5";
  String f = "MD5";
  void a() throws Exception { MessageDigest.getInstance("MD5"); }
  void b() throws Exception { MessageDigest.getInstance("MD2"); }
  void c() throws Exception { MessageDigest.getInstance("MD4"); }
  void d() throws Exception { MessageDigest.getInstance("SHA1"); }
  void e() throws Exception { MessageDigest.getInstance("SHA-1"); }
  void g() throws Exception { MessageDigest.getInstance("SHA"); }
  void h() throws Exception { MessageDigest.getInstance("md5"); }
  void i() throws Exception { MessageDigest.getInstance("SHA-256"); }
  void j() throws Exception { MessageDigest.getInstance("MD5", "BC"); }
  void k(Provider p) throws Exception { MessageDigest.getInstance("SHA1", p); }
  void l() throws Exception { MessageDigest.getInstance(M); }
  void m() throws Exception { String s = "MD5"; MessageDigest.getInstance(s); }
  void n(boolean x) throws Exception { MessageDigest.getInstance(x ? "MD5" : "SHA-256"); }
  void o(String s) throws Exception { MessageDigest.getInstance(s); }
  void p() throws Exception { MessageDigest.getInstance(f); }
  void q() throws Exception { Signature.getInstance("MD5withRSA"); }
  void r() throws Exception { Signature.getInstance("SHA1withRSA"); }
  void s() throws Exception { Signature.getInstance("SHA1withDSA"); }
  void t() throws Exception { Signature.getInstance("SHA256withRSA"); }
  void u() { DigestUtils.md5("x"); }
  void v() { DigestUtils.md5Hex("x"); }
  void w() { DigestUtils.sha("x".getBytes()); }
  void x() { DigestUtils.shaHex("x"); }
  void y() { DigestUtils.sha1("x"); }
  void z() { DigestUtils.sha1Hex("x"); }
  void aa() { DigestUtils.md2("x"); }
  void ab() { DigestUtils.md2Hex("x"); }
  void ac() { DigestUtils.getMd5Digest(); }
  void ad() { DigestUtils.getSha1Digest(); }
  void ae() { DigestUtils.getMd2Digest(); }
  void af() { DigestUtils.getShaDigest(); }
  void ag() { DigestUtils.getDigest("MD5"); }
  void ah() { DigestUtils.sha256("x"); }
  void ai() throws Exception { javax.crypto.Mac.getInstance("HmacMD5"); }
  void aj() throws Exception { javax.crypto.Mac.getInstance("HmacSHA1"); }
  void ak() throws Exception { MessageDigest.getInstance("MD5"); MessageDigest.getInstance("SHA1"); MessageDigest.getInstance("MD5"); }
  void al() throws Exception { MessageDigest.getInstance("MD5"); MessageDigest.getInstance("MD5");
    MessageDigest.getInstance("MD5"); }
  void am() throws Exception { MessageDigest.getInstance("Md5"); MessageDigest.getInstance("sha-1"); }
  void an() throws Exception { MessageDigest.getInstance("SHA-224"); MessageDigest.getInstance("SHA-512/224"); }
  void ao() throws Exception { new DigestUtils("MD5"); new DigestUtils(MessageDigest.getInstance("SHA-512")); }
  void ap() throws Exception { Runnable r = () -> { try { MessageDigest.getInstance("MD5"); } catch (Exception e) {} }; }
  void aq() throws Exception { KeyPairGenerator.getInstance("RSA"); java.security.AlgorithmParameters.getInstance("DES"); }
}
