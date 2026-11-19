package shop.pooled;

import jakarta.persistence.Cacheable;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Transient;
import java.io.Serializable;
import java.util.List;
import java.util.Map;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Cacheable
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
public class ApiToken implements Serializable {
  private static final long serialVersionUID = 1L;

  public abstract static class TokenAttribute {
    public abstract String name();
  }

  public static class Scope implements Serializable {
    private static final long serialVersionUID = 1L;
    private String name;
  }

  public interface Marker {
    String label();
  }

  @Id
  private long id;

  @JdbcTypeCode(SqlTypes.JSON)
  private List<TokenAttribute> attributes; // violation: CachedEntityFieldNotSerializable

  @Convert(converter = RenderingConverter.class)
  private Rendering rendering; // violation: CachedEntityFieldNotSerializable

  @JdbcTypeCode(SqlTypes.JSON)
  private Map<String, Scope> scopes;

  @JdbcTypeCode(SqlTypes.JSON)
  private transient List<TokenAttribute> scratch;

  @JdbcTypeCode(SqlTypes.JSON)
  private Marker marker;

  @JdbcTypeCode(SqlTypes.JSON)
  private Iterable<String> names;

  @Transient
  private Rendering preview;

  private Rendering unmapped;

  public long id() {
    return id;
  }
}
