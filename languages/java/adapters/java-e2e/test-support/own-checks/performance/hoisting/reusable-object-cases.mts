const LENIENT_READ =
  'new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false).readValue(json, Map.class);';

const MAIN = 'src/main/java/demo';
const REUSABLE_CHECK = 'ReusableObjectPerCall';

export const REUSABLE_OBJECT_CASES = [
  {
    check: REUSABLE_CHECK,
    file: `${MAIN}/JsonFixed.java`,
    before: `package demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.google.gson.Gson;
import java.util.List;
import java.util.Map;

public class JsonFixed {
  private final String name = "x";

  Map<?, ?> inline(String json) throws Exception {
    return new ObjectMapper().readValue(json, Map.class);
  }

  String write(Object value) throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    String text = mapper.writeValueAsString(value);
    return text + mapper.writeValueAsString(name);
  }

  String gson(Object value) {
    return new Gson().toJson(value);
  }

  <T> T fromGson(String json, Class<T> type) {
    final Gson gson = new Gson();
    return gson.fromJson(json, type);
  }

  Object built(String json) throws Exception {
    return JsonMapper.builder().build().readTree(json);
  }

  List<String> lambda(List<String> values) {
    return values.stream().map(value -> new ObjectMapper().valueToTree(value).asText()).toList();
  }

  static class Nested {
    Object read(String json) throws Exception {
      return new ObjectMapper().readTree(json);
    }
  }

  class Inner {
    String write(Object value) {
      Gson gson = new Gson();
      return gson.toJson(value);
    }
  }
}
`,
    after: `package demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.google.gson.Gson;
import java.util.List;
import java.util.Map;

public class JsonFixed {
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
  private static final Gson GSON = new Gson();
  private static final JsonMapper JSON_MAPPER = JsonMapper.builder().build();

  private final String name = "x";

  Map<?, ?> inline(String json) throws Exception {
    return OBJECT_MAPPER.readValue(json, Map.class);
  }

  String write(Object value) throws Exception {
    String text = OBJECT_MAPPER.writeValueAsString(value);
    return text + OBJECT_MAPPER.writeValueAsString(name);
  }

  String gson(Object value) {
    return GSON.toJson(value);
  }

  <T> T fromGson(String json, Class<T> type) {
    return GSON.fromJson(json, type);
  }

  Object built(String json) throws Exception {
    return JSON_MAPPER.readTree(json);
  }

  List<String> lambda(List<String> values) {
    return values.stream().map(value -> OBJECT_MAPPER.valueToTree(value).asText()).toList();
  }

  static class Nested {
    Object read(String json) throws Exception {
      return OBJECT_MAPPER.readTree(json);
    }
  }

  class Inner {
    String write(Object value) {
      return GSON.toJson(value);
    }
  }
}
`,
    lines: [9],
  },
  {
    check: REUSABLE_CHECK,
    file: `${MAIN}/JsonTaken.java`,
    before: `package demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.Gson;

public class JsonTaken {
  private static final String OBJECT_MAPPER = "taken";

  String read(String json) throws Exception {
    return new ObjectMapper().readTree(json) + OBJECT_MAPPER;
  }

  record Named(String name) {
    String toJson() {
      return new Gson().toJson(this);
    }
  }
}
`,
    after: `package demo;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.gson.Gson;

public class JsonTaken {
  private static final ObjectMapper OBJECT_MAPPER_2 = new ObjectMapper();
  private static final Gson GSON = new Gson();

  private static final String OBJECT_MAPPER = "taken";

  String read(String json) throws Exception {
    return OBJECT_MAPPER_2.readTree(json) + OBJECT_MAPPER;
  }

  record Named(String name) {
    String toJson() {
      return GSON.toJson(this);
    }
  }
}
`,
    lines: [6],
  },
  {
    check: REUSABLE_CHECK,
    file: `${MAIN}/JsonDeclined.java`,
    before: `package demo;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.function.Supplier;

public class JsonDeclined {
  private static final Supplier<ObjectMapper> FACTORY = () -> new ObjectMapper();
  private final ObjectMapper held = new ObjectMapper();

  JsonDeclined() throws Exception {
    new ObjectMapper().readTree("{}");
  }

  Map<?, ?> configured(String json) throws Exception {
    return ${LENIENT_READ}
  }

  Map<?, ?> configuredLocal(String json) throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    mapper.enable(SerializationFeature.INDENT_OUTPUT);
    return mapper.readValue(json, Map.class);
  }

  Map<?, ?> escapes(String json) throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    return use(mapper, json);
  }

  Map<?, ?> use(ObjectMapper mapper, String json) throws Exception {
    return mapper.readValue(json, Map.class);
  }

  Object passed(String json) throws Exception {
    return use(new ObjectMapper(), json);
  }

  ObjectMapper returned() {
    return new ObjectMapper();
  }

  Object reassigned(String json) throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    mapper = new ObjectMapper();
    return mapper.readTree(json);
  }

  Object supertype(String json) throws Exception {
    Object mapper = new ObjectMapper();
    return mapper.toString();
  }

  Object subclass(String json) throws Exception {
    return new ObjectMapper() {}.readTree(json);
  }

  Object builderConfigured(String json) throws Exception {
    return JsonMapper.builder().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build().readTree(json);
  }

  String gsonBuilder(Object value) {
    return new GsonBuilder().create().toJson(value);
  }

  String gsonConfigured(Object value) {
    return new GsonBuilder().setPrettyPrinting().create().toJson(value);
  }

  String gsonArgs(Object value) {
    return new Gson().newBuilder().create().toJson(value);
  }

  Object anonymous(String json) throws Exception {
    return new Callable<Object>() {
      @Override
      public Object call() throws Exception {
        return new ObjectMapper().readTree(json);
      }
    }.call();
  }

  Object local(String json) throws Exception {
    class Reader {
      Object read() throws Exception {
        return new ObjectMapper().readTree(json);
      }
    }
    return new Reader().read();
  }

  enum Format {
    JSON {
      @Override
      Object read(String json) throws Exception {
        return new ObjectMapper().readTree(json);
      }
    };

    abstract Object read(String json) throws Exception;

    Object parse(String json) throws Exception {
      return new ObjectMapper().readTree(json);
    }
  }

  interface Parser {
    default Object parse(String json) throws Exception {
      return new ObjectMapper().readTree(json);
    }
  }
}
`,
    after: `package demo;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.function.Supplier;

public class JsonDeclined {
  private static final Supplier<ObjectMapper> FACTORY = () -> new ObjectMapper();
  private final ObjectMapper held = new ObjectMapper();

  JsonDeclined() throws Exception {
    new ObjectMapper().readTree("{}");
  }

  Map<?, ?> configured(String json) throws Exception {
    return ${LENIENT_READ}
  }

  Map<?, ?> configuredLocal(String json) throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    mapper.enable(SerializationFeature.INDENT_OUTPUT);
    return mapper.readValue(json, Map.class);
  }

  Map<?, ?> escapes(String json) throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    return use(mapper, json);
  }

  Map<?, ?> use(ObjectMapper mapper, String json) throws Exception {
    return mapper.readValue(json, Map.class);
  }

  Object passed(String json) throws Exception {
    return use(new ObjectMapper(), json);
  }

  ObjectMapper returned() {
    return new ObjectMapper();
  }

  Object reassigned(String json) throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    mapper = new ObjectMapper();
    return mapper.readTree(json);
  }

  Object supertype(String json) throws Exception {
    Object mapper = new ObjectMapper();
    return mapper.toString();
  }

  Object subclass(String json) throws Exception {
    return new ObjectMapper() {}.readTree(json);
  }

  Object builderConfigured(String json) throws Exception {
    return JsonMapper.builder().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build().readTree(json);
  }

  String gsonBuilder(Object value) {
    return new GsonBuilder().create().toJson(value);
  }

  String gsonConfigured(Object value) {
    return new GsonBuilder().setPrettyPrinting().create().toJson(value);
  }

  String gsonArgs(Object value) {
    return new Gson().newBuilder().create().toJson(value);
  }

  Object anonymous(String json) throws Exception {
    return new Callable<Object>() {
      @Override
      public Object call() throws Exception {
        return new ObjectMapper().readTree(json);
      }
    }.call();
  }

  Object local(String json) throws Exception {
    class Reader {
      Object read() throws Exception {
        return new ObjectMapper().readTree(json);
      }
    }
    return new Reader().read();
  }

  enum Format {
    JSON {
      @Override
      Object read(String json) throws Exception {
        return new ObjectMapper().readTree(json);
      }
    };

    abstract Object read(String json) throws Exception;

    Object parse(String json) throws Exception {
      return new ObjectMapper().readTree(json);
    }
  }

  interface Parser {
    default Object parse(String json) throws Exception {
      return new ObjectMapper().readTree(json);
    }
  }
}
`,
    lines: [],
  },
];
