package shop.intake;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

record CreateOrder(String customerId, Map<String, Object> attributes, JsonNode payload, List<OrderLine> lines,
    Map<String, String> labels, Set<Status> statuses, Optional<Address> billing) {}

record OrderLine(String sku, Object[] options, Map<String, List<Object>> variants, List<String> tags) {}

record Address(String street, Map<String, Integer> codes) {}

enum Status {
  OPEN, CLOSED;

  private final Object hint = new Object();
}

class Envelope<T> {
  private T data;
  private String kind;
}

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME)
@JsonSubTypes({@JsonSubTypes.Type(Circle.class), @JsonSubTypes.Type(Freeform.class)})
interface Shape {}

record Circle(double radius) implements Shape {}

record Freeform(ObjectNode points) implements Shape {}

class Profile {
  private String name;

  @JsonAnySetter
  void put(String key, Object value) {}

  @JsonAnySetter(enabled = false)
  void ignored(String key, Object value) {}
}

record Remainder(String id, @JsonAnySetter Map<String, Object> rest) {}

class AuditedRequest {
  private Map<String, ?> audit;
}

class UploadMeta extends AuditedRequest {
  private String fileName;
}

class SearchForm {
  private List<Map<String, Object>> filters;
}

class Settings {
  static final Map<String, Object> DEFAULTS = Map.of();
  @JsonIgnore private Object cache;
  private transient Object scratch;
  @JsonProperty(access = JsonProperty.Access.READ_ONLY) private Map<String, Object> computed;
  @JsonDeserialize(as = String.class) private Object custom;
  private Map<String, List<String>> options;
}

record ImportJob(String source, Object payload) {}

record ChatMessage(String text, Map<String, ?> meta) {}

record Unbound(Object anything) {}
