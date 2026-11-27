package p;
public class V {
  void a1() { new org.springframework.jdbc.datasource.DriverManagerDataSource("u", "n", "p"); }
  void a2() { new javax.mail.PasswordAuthentication("u", "p"); }
  void a3() { new org.apache.http.auth.UsernamePasswordCredentials("u", "p"); }
  void a3b() { new org.apache.http.auth.UsernamePasswordCredentials("u:p"); }
  void a4(io.jsonwebtoken.JwtBuilder b) { b.signWith(null, "k"); }
  void a4b(io.jsonwebtoken.JwtBuilder b) { b.signWith(null, new byte[] {1}); }
  void a4c(io.jsonwebtoken.JwtBuilder b) { b.setSigningKey("k"); }
  void a5() { com.auth0.jwt.algorithms.Algorithm.HMAC256("k"); }
  void a5b() { com.auth0.jwt.algorithms.Algorithm.HMAC256(new byte[] {1}); }
  void a5c() { com.auth0.jwt.algorithms.Algorithm.HMAC512("k"); }
  void a6() { okhttp3.Credentials.basic("u", "p"); }
  void a7() { new org.apache.shiro.authc.UsernamePasswordToken("u", "p"); }
  void a7b() { new org.apache.shiro.authc.UsernamePasswordToken("u", "p".toCharArray()); }
  void a8() { new org.springframework.security.authentication.UsernamePasswordAuthenticationToken("u", "p"); }
  void a9() { com.mongodb.MongoCredential.createCredential("u", "d", "p".toCharArray()); }
  void a9b() { com.mongodb.MongoCredential.createScramSha256Credential("u", "d", "p".toCharArray()); }
  void a10(redis.clients.jedis.Jedis j) { j.auth("p"); }
  void a10b(redis.clients.jedis.Jedis j) { j.auth("u", "p"); }
  void a12() { org.springframework.security.crypto.encrypt.Encryptors.text("p", "s"); }
  void a12b() { org.springframework.security.crypto.encrypt.Encryptors.standard("p", "s"); }
  void a13() { new org.apache.commons.codec.digest.HmacUtils("a", "k"); }
  void a13b() { new org.apache.commons.codec.digest.HmacUtils("a", new byte[] {1}); }
  void a13c() { org.apache.commons.codec.digest.HmacUtils.hmacSha256("k", "v"); }
  void a14() { new com.google.crypto.tink.subtle.AesGcmJce(new byte[] {1}); }
  void a15() { new org.bouncycastle.crypto.params.KeyParameter(new byte[] {1}); }
  void a16(org.apache.commons.net.ftp.FTPClient f) { f.login("u", "p"); }
  void a17() { new com.amazonaws.auth.BasicAWSCredentials("a", "s"); }
  void a18() { software.amazon.awssdk.auth.credentials.AwsBasicCredentials.create("a", "s"); }
}
