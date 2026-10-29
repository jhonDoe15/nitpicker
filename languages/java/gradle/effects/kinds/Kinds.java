package nitpicker.effects.kinds;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.classes.ClassIndex;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodNode;

public final class Kinds {
  public static final String DATABASE = KindTable.DATABASE;
  public static final String REMOTE = KindTable.REMOTE;
  public static final String MESSAGE = KindTable.MESSAGE;
  private static final Set<String> OBJECT_METHODS =
      Set.of("toString", "hashCode", "equals", "getClass", "<init>", "<clinit>", "close", "finalize");
  private static final List<String> CLIENT_TYPES = List.of(
      "Lorg/springframework/cloud/openfeign/FeignClient;",
      "Lorg/springframework/web/service/annotation/HttpExchange;");
  private static final List<String> CLIENT_METHODS = List.of(
      "Lfeign/RequestLine;", "Lretrofit2/http/GET;", "Lretrofit2/http/POST;", "Lretrofit2/http/PUT;",
      "Lretrofit2/http/DELETE;", "Lretrofit2/http/PATCH;", "Lretrofit2/http/HEAD;", "Lretrofit2/http/HTTP;",
      "Lretrofit2/http/OPTIONS;", "Lorg/springframework/web/service/annotation/GetExchange;",
      "Lorg/springframework/web/service/annotation/PostExchange;",
      "Lorg/springframework/web/service/annotation/PutExchange;",
      "Lorg/springframework/web/service/annotation/DeleteExchange;",
      "Lorg/springframework/web/service/annotation/PatchExchange;",
      "Lorg/springframework/web/service/annotation/HttpExchange;");
  private static final Set<String> REDIS_TYPES = Set.of("RedisOperations", "RedisTemplate", "StringRedisTemplate",
      "ValueOperations", "HashOperations", "ListOperations", "SetOperations", "ZSetOperations", "Jedis",
      "UnifiedJedis", "JedisPooled", "JedisCluster", "RedisCommands", "RedisAdvancedClusterCommands");
  private final ClassIndex index;
  private final Map<String, String> cache = new HashMap<>();

  public Kinds(ClassIndex index) {
    this.index = index;
  }

  public String direct(String owner, String name, String desc) {
    if (owner.startsWith("[") || OBJECT_METHODS.contains(name)) {
      return null;
    }
    String key = owner + '.' + name + desc;
    if (cache.containsKey(key)) {
      return cache.get(key);
    }
    String kind = resolve(owner, name, desc);
    cache.put(key, kind);
    return kind;
  }

  public boolean isRedis(String label) {
    return REDIS_TYPES.contains(label.substring(0, Math.max(0, label.indexOf('.'))));
  }

  public boolean isRepository(String owner) {
    return index.isSubtype(owner, "org/springframework/data/repository/Repository");
  }

  private String resolve(String owner, String name, String desc) {
    for (KindTable.Entry entry : KindTable.ENTRIES) {
      if (entry.matches(name) && index.isSubtype(owner, entry.type())) {
        return entry.kind();
      }
    }
    return declarativeClient(owner, name, desc) ? REMOTE : extension(owner, name, desc);
  }

  private String extension(String owner, String name, String desc) {
    Type[] arguments = Type.getArgumentTypes(desc);
    if (!owner.endsWith("Kt") || index.isProject(owner) || arguments.length == 0
        || arguments[0].getSort() != Type.OBJECT) {
      return null;
    }
    String receiver = arguments[0].getInternalName();
    for (KindTable.Entry entry : KindTable.ENTRIES) {
      if (entry.allows(name) && index.isSubtype(receiver, entry.type())) {
        return entry.kind();
      }
    }
    return null;
  }

  private boolean declarativeClient(String owner, String name, String desc) {
    if (!index.header(owner).isInterface()) {
      return false;
    }
    for (String type : CLIENT_TYPES) {
      if (index.annotated(owner, type)) {
        return true;
      }
    }
    ClassNode node = index.library(owner);
    MethodNode method = node == null ? null
        : node.methods.stream().filter(m -> m.name.equals(name) && m.desc.equals(desc)).findFirst().orElse(null);
    return method != null
        && Annotations.findAny(CLIENT_METHODS, method.visibleAnnotations, method.invisibleAnnotations) != null;
  }
}
