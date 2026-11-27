package c;
import javax.crypto.*;
import java.security.*;
import org.apache.commons.codec.digest.DigestUtils;
public class C4 {
  void m0() throws Exception { Cipher.getInstance("x/GCM-/y"); }
  void m1() throws Exception { Cipher.getInstance("x/GCM-x/y"); }
  void m2() throws Exception { Cipher.getInstance("x/CCM-SIV/y"); }
  void m3() throws Exception { Cipher.getInstance("x/EAX-x/y"); }
  void m4() throws Exception { Cipher.getInstance("x/CWC/y"); }
  void m5() throws Exception { Cipher.getInstance("x/GCMSIV/y"); }
  void m6() throws Exception { Cipher.getInstance("x/OCB-SIV/y"); }
  void m7() throws Exception { Cipher.getInstance("x/GCM_SIV/y"); }
  void m8() throws Exception { Cipher.getInstance("x/OCB3/y"); }
  void m9() throws Exception { Cipher.getInstance("x/CCM8/y"); }
  void m10() throws Exception { Cipher.getInstance("x/IAPM/y"); }
  void m11() throws Exception { Cipher.getInstance("x/CTR/y"); }
  void m12() throws Exception { Cipher.getInstance("x/GCM-SIV"); }
  void m13() throws Exception { Cipher.getInstance("x/GCM-SIVx/y"); }
  void m14() throws Exception { Cipher.getInstance("x/gcm-siv/y"); }
  void m15() throws Exception { Cipher.getInstance("x/SIV-GCM/y"); }
  void m16() throws Exception { Cipher.getInstance("x/XGCM-SIV/y"); }
  void m17() throws Exception { Cipher.getInstance("x/GCM-SIV/"); }
  void m18() throws Exception { Cipher.getInstance("x/GCM-SIV-x/y"); }
  void s0() throws Exception { Signature.getInstance("MD5withRSA", "BC"); }
  void s1(Provider p) throws Exception { Signature.getInstance("SHA1withRSA", p); }
  void s2() throws Exception { MessageDigest.getInstance("MD5", (Provider) null); }
  void u0() { DigestUtils.isAvailable("MD5"); }
  void u1() { DigestUtils.getDigest("MD5", null); }
  void u2() { DigestUtils.getDigest("SHA-256"); }
  void u3() throws Exception { DigestUtils.md5(new java.io.ByteArrayInputStream(new byte[0])); }
  void u4() { DigestUtils.md5(new byte[0]); }
  void u5() { DigestUtils.sha256Hex("x"); }
  void u6() { new DigestUtils(DigestUtils.getSha1Digest()).digest("x"); }
  void u7() { DigestUtils.digest(DigestUtils.getMd5Digest(), new byte[0]); }
  void u8() { DigestUtils.getDigest("md5"); DigestUtils.getDigest("SHA1withRSA"); }
  void u9() { DigestUtils.getDigest("SHA"); }
  void u10() { DigestUtils.getDigest("MD5withRSA"); }
  void u11() throws Exception { Signature.getInstance("SHA1withRSA"); MessageDigest.getInstance("SHA1withRSA"); }
}
