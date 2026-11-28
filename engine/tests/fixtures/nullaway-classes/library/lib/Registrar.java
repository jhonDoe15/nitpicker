package lib;

import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

public interface Registrar {
  void register(String name, @Nullable ClassLoader loader);

  void lists(@Nullable List<? extends @Nullable Number> numbers, Map<String, @Nullable Object> map, String key);

  void arrays(String @Nullable [] values, @Nullable String[] elements, int key);

  void spread(String key, @Nullable Object... rest);

  void spreadArray(String key, Object @Nullable ... rest);

  void nested(Map.@Nullable Entry<String, String> entry, String key);

  void inner(Util.Outer.@Nullable Inner inner, String key);

  void checker(@qual.Nullable String text, String key);

  @Nullable String result();

  String @Nullable [] arrayResult();

  @Nullable String[] elementResult();
}
