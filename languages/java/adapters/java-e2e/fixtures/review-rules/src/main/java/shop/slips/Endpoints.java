package shop.slips;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.util.StringValueResolver;

public final class Endpoints {
  @Retention(RetentionPolicy.RUNTIME)
  @Target(ElementType.METHOD)
  public @interface Listener {
    String[] topics();

    String group();

    String consumes();

    String id();
  }

  public static final class Endpoint {
    private String[] topics;
    private String group;
    private String consumes;
    private String id;

    void setTopics(String[] topics) {
      this.topics = topics.clone();
    }

    void setGroup(String group) {
      this.group = group;
    }

    void setConsumes(String consumes) {
      this.consumes = consumes;
    }

    void setId(String id) {
      this.id = id;
    }

    String describe() {
      return id + group + consumes + topics.length;
    }
  }

  private final StringValueResolver resolver;

  public Endpoints(StringValueResolver resolver) {
    this.resolver = resolver;
  }

  private String resolve(String value) {
    return resolver.resolveStringValue(value);
  }

  private String[] resolve(String[] values) {
    String[] resolved = new String[values.length];
    for (int i = 0; i < values.length; i++) {
      resolved[i] = resolve(values[i]);
    }
    return resolved;
  }

  public Endpoint describe(Listener listener) {
    Endpoint endpoint = new Endpoint();
    endpoint.setTopics(resolve(listener.topics()));
    endpoint.setGroup(resolve(listener.group()));
    endpoint.setConsumes(listener.consumes()); // violation: AnnotationAttributeNotResolved
    return endpoint;
  }

  public Endpoint describeAll(Listener listener) {
    Endpoint endpoint = new Endpoint();
    endpoint.setTopics(resolve(listener.topics()));
    endpoint.setGroup(resolve(listener.group()));
    endpoint.setConsumes(resolve(listener.consumes()));
    endpoint.setId(listener.id()); // violation: AnnotationAttributeNotResolved
    return endpoint;
  }

  public Endpoint describeLiteral(Listener listener) {
    Endpoint endpoint = new Endpoint();
    endpoint.setTopics(resolve(listener.topics()));
    endpoint.setGroup(resolve(listener.group()));
    endpoint.setConsumes(resolve(listener.consumes()));
    endpoint.setId(resolve(listener.id()));
    return endpoint;
  }

  public Endpoint describeOne(Listener listener) {
    Endpoint endpoint = new Endpoint();
    endpoint.setGroup(resolve(listener.group()));
    endpoint.setConsumes(listener.consumes());
    return endpoint;
  }

  public Map<String, String> describeAll(Listener listener, List<Map.Entry<String, String>> entries) {
    Map<String, String> result = entries.stream()
        .collect(Collectors.toMap(entry -> resolve(entry.getKey()), entry -> entry.getValue()));
    result.put(resolve(listener.group()), listener.id());
    return result;
  }
}
