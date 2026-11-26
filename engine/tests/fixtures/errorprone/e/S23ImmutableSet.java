import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableSet;
import java.util.ArrayList;
import java.util.List;

class S23ImmutableSet {
  private static final ImmutableList<String> MY_LIST_2 = ImmutableList.of("hello");
  private static final ImmutableList<String> FROM_FUNC = initMyList();
  private static final ImmutableList RAW = ImmutableList.of("hello");
  private static final ImmutableList<String> ITERATED = ImmutableList.of("hello");
  private static final ImmutableList<String> PASSED = ImmutableList.of("hello");
  private static final ImmutableList<String> UNUSED = ImmutableList.of("hello");
  private static final ImmutableList<String> INDEXED = ImmutableList.of("hello");
  private final ImmutableList<String> instanceField = ImmutableList.of("hello");
  @SuppressWarnings("ImmutableSetForContains")
  private static final ImmutableList<String> SUPPRESSED = ImmutableList.of("hello");

  private static ImmutableList<String> initMyList() {
    return ImmutableList.of();
  }

  private void myFunc() {
    boolean b1 = MY_LIST_2.containsAll(new ArrayList<String>());
    boolean b2 = FROM_FUNC.contains("he");
    boolean b3 = RAW.isEmpty();
    for (String s : ITERATED) {
      System.out.println(s);
    }
    consumer(PASSED);
    boolean b4 = SUPPRESSED.contains("x");
    boolean b5 = instanceField.contains("x");
    int i = INDEXED.indexOf("x");
    boolean b6 = INDEXED.contains("x");
  }

  private void consumer(ImmutableList<String> arg) {}

  private static final class Nested {
    private static final ImmutableList<String> NESTED_1 = ImmutableList.of("a");
    private static final ImmutableList<String> NESTED_2 = ImmutableList.of("b");
  }

  private void other() {
    String one = Nested.NESTED_1.get(0);
    boolean two = Nested.NESTED_2.contains("b");
  }
}
