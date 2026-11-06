package shop.intake;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

record CreateOrder(String customerId, Map<String, Object> attributes, JsonNode payload, List<OrderLine> lines,
    Map<String, String> labels, Set<Status> statuses, Optional<Address> billing, Attributes extras, Tags tags) {}

class Attributes extends HashMap<String, Object> {}

class Tags extends ArrayList<String> {}

record OrderLine(String sku, Object[] options, Map<String, List<Object>> variants, List<String> tags) {}

record Address(String street, Map<String, Integer> codes) {}

enum Status {
  OPEN, CLOSED;

  private final Object hint = new Object();
}

class Envelope<T> {
  private T data;
  private String kind;

  public T getData() {
    return data;
  }

  public String getKind() {
    return kind;
  }
}

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME)
@JsonSubTypes({@JsonSubTypes.Type(Circle.class), @JsonSubTypes.Type(Freeform.class)})
interface Shape {}

record Circle(double radius) implements Shape {}

record Freeform(ObjectNode points) implements Shape {}

class Profile {
  public String name;

  @JsonAnySetter
  void put(String key, Object value) {}

  @JsonAnySetter(enabled = false)
  void ignored(String key, Object value) {}
}

record Remainder(String id, @JsonAnySetter Map<String, Object> rest) {}

class AuditedRequest {
  private Map<String, ?> audit;

  public void setAudit(Map<String, ?> audit) {
    this.audit = audit;
  }
}

class UploadMeta extends AuditedRequest {
  public String fileName;
}

class SearchForm {
  public List<Map<String, Object>> filters;
}

@JsonIgnoreProperties({"hidden"})
class Settings {
  static final Map<String, Object> DEFAULTS = Map.of();
  @JsonIgnore public Object cache;
  public transient Object scratch;
  @JsonProperty(access = JsonProperty.Access.READ_ONLY) private Map<String, Object> computed;
  @JsonDeserialize(as = String.class) public Object custom;
  public Map<String, List<String>> options;
  public Object hidden;
  private final Object lock = new Object();
  private Object viaGetter;

  @JsonIgnore
  public Object getViaGetter() {
    return viaGetter;
  }
}

class Node<X extends Node<X>> {
  public X self;
  public List<? extends X> children;
  public Node<?> next;
}

class TreeNode extends Node<TreeNode> {}

abstract class CrudController<T> {
  @PostMapping("/intake/crud")
  public void save(@RequestBody T body) {}
}

class LedgerEntry {
  public Object memo;
}

@RestController
class LedgerController extends CrudController<LedgerEntry> {}

class Delivery {
  public Object contents;
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.PARAMETER)
@interface CurrentMember {}

class Member {
  public Object details;
}

record ImportJob(String source, Object payload) {}

record ChatMessage(String text, Map<String, ?> meta) {}

record Unbound(Object anything) {}
