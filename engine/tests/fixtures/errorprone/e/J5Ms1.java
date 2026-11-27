

import com.google.common.collect.ImmutableList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Test cases for {@link com.google.errorprone.bugpatterns.ModifySourceCollectionInStream}.
 *
 * @author deltazulu@google.com (Donald Duo Zhao)
 */
public class J5Ms1 {

  private final List<Integer> mutableValues = Arrays.asList(1, 2, 3);

  private void mutateStreamSourceMethodReference() {

    mutableValues.stream()
        .map(x -> x + 1)
        .filter(x -> x < 5)
        // BUG: Diagnostic contains:
        .forEach(mutableValues::remove);

    this.mutableValues.stream()
        .map(x -> x + 1)
        .filter(x -> x < 5)
        // BUG: Diagnostic contains:
        .forEach(mutableValues::remove);

    getMutableValues().parallelStream()
        .map(x -> x + 1)
        .filter(x -> x < 5)
        // BUG: Diagnostic contains:
        .forEach(getMutableValues()::add);

    getMutableValues().stream()
        .map(x -> x + 1)
        .filter(x -> x < 5)
        // BUG: Diagnostic contains:
        .forEach(this.getMutableValues()::remove);

    J5Ms1[] cases = {
      new J5Ms1(),
      new J5Ms1()
    };
    cases[0].mutableValues.stream()
        .map(x -> x + 1)
        .filter(x -> x < 5)
        // BUG: Diagnostic contains:
        .forEach(cases[0].mutableValues::add);
  }

  private List<Integer> mutateStreamSourceLambdaExpression(
      ImmutableList<Integer> mutableParamList) {
    Stream<Integer> values1 =
        mutableParamList.stream()
            .map(
                x -> {
                  // BUG: Diagnostic contains:
                  mutableParamList.add(x);
                  return x + 1;
                });

    Stream<Integer> values2 =
        mutableParamList.stream()
            .filter(
                x -> {
                  // BUG: Diagnostic contains:
                  mutableParamList.remove(x);
                  return mutableParamList.size() > 5;
                });

    return Stream.concat(values1, values2).collect(Collectors.toList());
  }

  private List<Integer> getMutableValues() {
    return mutableValues;
  }
}
