package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.File;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

abstract class HashOrderTest {
  @Test
  void expectsAnOrderFromHashCollections() {
    Set<String> roles = new HashSet<>(List.of("ADMIN", "AUDITOR"));
    Map<String, Integer> stock = new HashMap<>();
    stock.put("pen", 1);
    stock.put("ink", 2);
    assertThat(roles).containsExactly("ADMIN", "AUDITOR"); // violation: HashOrderAssertedInTest
    assertThat(stock.keySet()).containsExactly("pen", "ink"); // violation: HashOrderAssertedInTest
    assertThat(stock.values()).containsExactly(1, 2); // violation: HashOrderAssertedInTest
    assertThat(Set.of("pen", "ink")).containsExactly("pen", "ink"); // violation: HashOrderAssertedInTest
    assertThat(Map.of("pen", 1, "ink", 2).keySet()).containsExactly("pen", "ink"); // violation: HashOrderAssertedInTest
  }

  @Test
  void expectsAnOrderFromCollectedSets() {
    Set<String> names = Stream.of("pen", "ink").collect(Collectors.toSet());
    assertThat(names).containsExactly("pen", "ink"); // violation: HashOrderAssertedInTest
    assertThat(Stream.of("pen", "ink").collect(Collectors.toSet())) // violation: HashOrderAssertedInTest
        .containsExactly("pen", "ink");
  }

  @Test
  void expectsAnOrderFromListingsAndReflection() {
    File folder = new File("build");
    String[] listed = folder.list();
    assertArrayEquals(new String[] {"classes", "libs"}, listed); // violation: HashOrderAssertedInTest
    assertThat(folder.list()).containsExactly("classes", "libs"); // violation: HashOrderAssertedInTest
    assertThat(Status.class.getDeclaredMethods()).containsExactly(null, null); // violation: HashOrderAssertedInTest
  }

  @Test
  void assertsWithoutAnOrder() {
    Set<String> roles = new HashSet<>(List.of("ADMIN", "AUDITOR"));
    assertThat(roles).containsExactlyInAnyOrder("ADMIN", "AUDITOR");
    assertThat(roles).containsExactly("ADMIN");
    assertEquals(Set.of("ADMIN", "AUDITOR"), roles);
    assertThat(Set.of("pen")).containsExactly("pen");
    assertArrayEquals(new String[] {"classes"}, new File("build").list());
    String[] sorted = new File("build").list();
    Arrays.sort(sorted);
    assertArrayEquals(new String[] {"classes", "libs"}, sorted);
    assertThat(sorted).containsExactly("classes", "libs");
  }

  @Test
  void assertsOrderedCollections() {
    Set<String> sorted = new TreeSet<>(Set.of("pen", "ink"));
    Set<String> inserted = new LinkedHashSet<>(List.of("pen", "ink"));
    Set<String> replaced = new HashSet<>(List.of("pen", "ink"));
    replaced = new TreeSet<>(replaced);
    List<String> names = List.of("pen", "ink");
    assertThat(sorted).containsExactly("ink", "pen");
    assertThat(inserted).containsExactly("pen", "ink");
    assertThat(replaced).containsExactly("ink", "pen");
    assertThat(names).containsExactly("pen", "ink");
    assertThat(names.stream().sorted().collect(Collectors.toList())).containsExactly("ink", "pen");
  }
}
