package c;
import java.security.*;
public class S2 {
  void s0() throws Exception { Signature.getInstance("MD5withRSA"); }
  void s1() throws Exception { Signature.getInstance("MD2withRSA"); }
  void s2() throws Exception { Signature.getInstance("SHA1withECDSA"); }
  void s3() throws Exception { Signature.getInstance("SHAwithDSA"); }
  void s4() throws Exception { Signature.getInstance("md5withrsa"); }
  void s5() throws Exception { Signature.getInstance("SHA-1withRSA"); }
  void s6() throws Exception { Signature.getInstance("SHA1WithRSA"); }
  void s7() throws Exception { Signature.getInstance("SHA1"); }
  void s8() throws Exception { Signature.getInstance("MD5"); }
  void s9() throws Exception { Signature.getInstance("SHA224withRSA"); }
  void s10() throws Exception { Signature.getInstance("NONEwithRSA"); }
  void s11() throws Exception { Signature.getInstance("SHA1withRSA/PSS"); }
  void s12() throws Exception { Signature.getInstance("RSASSA-PSS"); }
  void s13() throws Exception { Signature.getInstance("sha1withrsa"); }
  void s14() throws Exception { Signature.getInstance("MD5andSHA1withRSA"); }
  void s15() throws Exception { Signature.getInstance("SHA1withRSAandMGF1"); }
  void s16() throws Exception { Signature.getInstance("xMD5withRSA"); }
  void s17() throws Exception { Signature.getInstance("SHA1withRSAx"); }
  void d0() throws Exception { MessageDigest.getInstance("MD5"); }
  void d1() throws Exception { MessageDigest.getInstance("md5"); }
  void d2() throws Exception { MessageDigest.getInstance("Md5"); }
  void d3() throws Exception { MessageDigest.getInstance("MD-5"); }
  void d4() throws Exception { MessageDigest.getInstance("MD5 "); }
  void d5() throws Exception { MessageDigest.getInstance("MD5withRSA"); }
  void d6() throws Exception { MessageDigest.getInstance("SHA1withRSA"); }
  void d7() throws Exception { MessageDigest.getInstance("SHA-0"); }
  void d8() throws Exception { MessageDigest.getInstance("SHA0"); }
  void d9() throws Exception { MessageDigest.getInstance("SHA"); }
  void d10() throws Exception { MessageDigest.getInstance("sha"); }
  void d11() throws Exception { MessageDigest.getInstance("SHA-1"); }
  void d12() throws Exception { MessageDigest.getInstance("SHA1"); }
  void d13() throws Exception { MessageDigest.getInstance("sha1"); }
  void d14() throws Exception { MessageDigest.getInstance("SHA-01"); }
  void d15() throws Exception { MessageDigest.getInstance("SHA1x"); }
  void d16() throws Exception { MessageDigest.getInstance("MD5x"); }
  void d17() throws Exception { MessageDigest.getInstance("xMD5"); }
  void d18() throws Exception { MessageDigest.getInstance("MD6"); }
  void d19() throws Exception { MessageDigest.getInstance("MD"); }
  void d20() throws Exception { MessageDigest.getInstance("MD2"); }
  void d21() throws Exception { MessageDigest.getInstance("md2"); }
  void d22() throws Exception { MessageDigest.getInstance("MD4"); }
  void d23() throws Exception { MessageDigest.getInstance("md4"); }
  void d24() throws Exception { MessageDigest.getInstance("RIPEMD160"); }
  void d25() throws Exception { MessageDigest.getInstance("SHA-384"); }
  void d26() throws Exception { MessageDigest.getInstance("SHA3-256"); }
  void d27() throws Exception { MessageDigest.getInstance("SHA_1"); }
  void d28() throws Exception { MessageDigest.getInstance("SHA-1 "); }
  void d29() throws Exception { MessageDigest.getInstance("SHA/1"); }
}
