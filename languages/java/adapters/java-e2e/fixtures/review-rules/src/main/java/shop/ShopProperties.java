package shop;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("shop")
public class ShopProperties {
  private String host;
  private List<String> hosts = List.of(); // violation: SingularAndPluralMember

  public String getHost() {
    return host;
  }

  public void setHost(String host) {
    this.host = host;
  }

  public List<String> getHosts() {
    return hosts;
  }

  public void setHosts(List<String> hosts) {
    this.hosts = List.copyOf(hosts);
  }
}
