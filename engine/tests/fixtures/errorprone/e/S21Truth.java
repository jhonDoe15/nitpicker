import static com.google.common.truth.Truth.assertThat;

import com.google.common.truth.Truth;
import java.util.HashMap;
import java.util.Map;

class S21TruthGetOrDefault {
  static final int ZERO = 0;
  static final long BIG = 5L;
  final Map<String, Integer> field = new HashMap<>();

  void positive() {
    Map<String, Integer> map = new HashMap<>();
    assertThat(map.getOrDefault("key", 0)).isEqualTo(0);
    Integer expectedVal = 0;
    assertThat(map.getOrDefault("key", expectedVal)).isEqualTo(expectedVal);
    Map<String, Long> longMap = new HashMap<>();
    assertThat(longMap.getOrDefault("key", 0L)).isEqualTo(5L);
    assertThat(map.getOrDefault("key", 0)).isEqualTo(1);
    assertThat(longMap.getOrDefault("key", 0L)).isEqualTo(0L);
    Truth.assertThat(map.getOrDefault("key", ZERO)).isEqualTo(ZERO);
    Truth.assertThat(map.getOrDefault("key", ZERO)).isEqualTo(
        1);
    assertThat(field.getOrDefault("a", this.ZERO)).isEqualTo(S21TruthGetOrDefault.ZERO);
    assertThat(longMap.getOrDefault("k" + 1, BIG)).isEqualTo(BIG);
    Map<String, String> strings = new HashMap<>();
    assertThat(strings.getOrDefault("key", "a")).isEqualTo("a");
    assertThat(strings.getOrDefault("key", "a")).isEqualTo("b");
    Map<String, Double> doubles = new HashMap<>();
    assertThat(doubles.getOrDefault("key", 1.0)).isEqualTo(1.0);
    assertThat(doubles.getOrDefault("key", 0.0)).isEqualTo(-0.0);
  }

  void negative(Map<String, Integer> map, int unknown) {
    Integer expectedVal = 10;
    assertThat(map.getOrDefault("key", 0)).isEqualTo(expectedVal);
    assertThat(map.getOrDefault("key", Integer.valueOf(0))).isEqualTo(Integer.valueOf(1));
    assertThat(map.getOrDefault("key", unknown)).isEqualTo(unknown + 1);
    assertThat(map.size()).isEqualTo(0);
    assertThat(map).isEqualTo(map.getOrDefault("key", 0));
    Map<String, Long> longMap = new HashMap<>();
    assertThat(longMap.getOrDefault("key", 0L)).isEqualTo(0);
    assertThat(longMap.getOrDefault("key", 1L)).isNotEqualTo(1L);
  }

  @SuppressWarnings("TruthGetOrDefault")
  void suppressed(Map<String, Integer> map) {
    assertThat(map.getOrDefault("key", 0)).isEqualTo(0);
  }
}
