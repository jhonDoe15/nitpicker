package shop;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("shop")
public class ShopProperties {
  private String host;
  private List<String> hosts = List.of(); // violation: SingularAndPluralMember
  private final Mail mail = new Mail();

  public static class Mail {
    private String sender;
    private List<String> senders = List.of(); // violation: SingularAndPluralMember

    public String getSender() {
      return sender;
    }

    public List<String> getSenders() {
      return senders;
    }
  }

  public static String joined(String host, String... hosts) {
    return host + String.join(",", hosts);
  }

  public Mail getMail() {
    return mail;
  }

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
