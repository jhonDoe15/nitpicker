package shop.requests;

import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

@Component
public class AttributesHolder {
  private RequestAttributes attributes;
  private String region;
  private HttpServletRequest request;

  @Autowired
  void setRequest(HttpServletRequest request) {
    this.request = request;
  }

  @PostConstruct
  void start() {
    region = System.getProperty("region", "eu");
  }

  public void capture() {
    attributes = RequestContextHolder.currentRequestAttributes();
  }

  public String region() {
    return region;
  }
}
