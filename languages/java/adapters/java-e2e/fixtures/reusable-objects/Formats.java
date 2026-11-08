package shop.reuse;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import jakarta.annotation.PostConstruct;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.io.Reader;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import jakarta.xml.bind.JAXBContext;
import org.springframework.context.annotation.Bean;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.web.util.pattern.PathPatternParser;

class Formats {
  private static final ObjectMapper SHARED = new ObjectMapper();
  private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
  private static final String TIME = "HH:mm";
  private final Gson gson;
  private final Map<Class<?>, JAXBContext> contexts = new ConcurrentHashMap<>();
  private ObjectMapper lazy;
  private Validator validator;

  Formats() {
    gson = new GsonBuilder().create();
  }

  String toJson(Object value) throws Exception {
    return new ObjectMapper().writeValueAsString(value); // violation: ReusableObjectPerCall
  }

  String day(LocalDate date) {
    return date.format(DateTimeFormatter.ofPattern("yyyy-MM-dd")); // violation: ReusableObjectPerCall
  }

  String time(LocalTime time) {
    return time.format(DateTimeFormatter.ofPattern(TIME)); // violation: ReusableObjectPerCall
  }

  String dynamic(LocalTime time, String pattern) {
    return time.format(DateTimeFormatter.ofPattern(pattern));
  }

  String gson(Object value) {
    return new Gson().toJson(value); // violation: ReusableObjectPerCall
  }

  Object spel(String text) {
    return new SpelExpressionParser().parseExpression(text).getValue(); // violation: ReusableObjectPerCall
  }

  boolean path(String pattern) {
    return new PathPatternParser().parse(pattern) != null; // violation: ReusableObjectPerCall
  }

  JAXBContext context(Class<?> type) throws Exception {
    return JAXBContext.newInstance(type);
  }

  Object unmarshal(Class<?> type, Reader reader) throws Exception {
    return JAXBContext.newInstance(type).createUnmarshaller().unmarshal(reader); // violation: ReusableObjectPerCall
  }

  Object cached(Class<?> type) {
    return contexts.computeIfAbsent(type, key -> {
      try {
        return JAXBContext.newInstance(key);
      } catch (Exception e) {
        throw new IllegalStateException(e);
      }
    });
  }

  ObjectMapper lazyMapper() {
    if (lazy == null) {
      lazy = new ObjectMapper();
    }
    return lazy;
  }

  String keptInLocal(Object value) throws Exception {
    ObjectMapper local;
    local = new ObjectMapper(); // violation: ReusableObjectPerCall
    return local.writeValueAsString(value);
  }

  boolean valid(Object value) {
    return Validation.buildDefaultValidatorFactory().getValidator().validate(value).isEmpty(); // violation: ReusableObjectPerCall
  }

  @PostConstruct
  void init() {
    validator = Validation.buildDefaultValidatorFactory().getValidator();
    warm();
  }

  private void warm() {
    lazy = JsonMapper.builder().build();
  }

  @Bean
  ObjectMapper mapper() {
    return JsonMapper.builder().build();
  }

  String built(Object value) throws Exception {
    return JsonMapper.builder().build().writeValueAsString(value); // violation: ReusableObjectPerCall
  }

  static String qualified(Object value) throws Exception {
    return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(value); // violation: ReusableObjectPerCall
  }

  public static void main(String[] args) throws Exception {
    System.out.println(new ObjectMapper().writeValueAsString(args));
  }

  Runnable task() {
    return new Runnable() {
      @Override
      public void run() {
        new Gson().toJson(SHARED); // violation: ReusableObjectPerCall
      }
    };
  }
}
