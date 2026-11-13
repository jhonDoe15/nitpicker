package shop.settings;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

@ConfigurationProperties("shop.token")
public class TokenProperties {
  private String issuerUri;
  private String bundle;
  private final Signing signing = new Signing();

  public String getIssuerUri() {
    return issuerUri;
  }

  public void setIssuerUri(String issuerUri) {
    this.issuerUri = issuerUri;
  }

  public String getBundle() {
    return bundle;
  }

  public void setBundle(String bundle) {
    this.bundle = bundle;
  }

  public Signing getSigning() {
    return signing;
  }

  public boolean isSslEnabled() {
    return this.bundle != null; // violation: SpringNullOnlyConfigCheck
  }

  public boolean hasIssuer() {
    return StringUtils.hasText(issuerUri);
  }

  public String bundleName() {
    return bundle == null ? null : bundle.trim();
  }

  public static class Signing {
    private String keyId;

    public String getKeyId() {
      return keyId;
    }

    public void setKeyId(String keyId) {
      this.keyId = keyId;
    }

    public boolean isSigned() {
      return keyId != null && !keyId.isBlank();
    }
  }
}
