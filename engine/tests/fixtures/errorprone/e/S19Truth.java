package e;

import static com.google.common.truth.Truth.assertThat;
import static java.util.Arrays.asList;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableSet;
import com.google.common.collect.Lists;
import com.google.common.collect.Sets;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

class S19Truth {
  void negatives() {
    assertThat(ImmutableList.of(1, 2, 3)).containsExactly(1, 2, 3);
    List<Integer> list = ImmutableList.of(1, 2, 3);
    assertThat(list).containsExactly(1, 2, 3);
    assertThat(list).containsExactlyElementsIn(list);
    assertThat(list).containsExactlyElementsIn(new java.util.ArrayList<>(list));
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(Sets.newHashSet(1, 2, 3));
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(ImmutableSet.of(1));
    assertThat(list).containsExactlyElementsIn((Object[]) null);
    assertThat(list).containsAtLeastElementsIn(Arrays.asList(1, 2));
  }

  void positives() {
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(Arrays.asList(1, 2, 3));
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(List.of(1, 2, 3));
    assertThat(ImmutableList.of(1, 2, 3))
        .containsExactlyElementsIn(Arrays.asList(1, 2, 3))
        .inOrder();
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(asList(1, 2, 3));
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(Lists.newArrayList(1, 2, 3));
    assertThat(ImmutableList.of(1)).containsExactlyElementsIn(Collections.singletonList(1));
    assertThat(ImmutableList.of()).containsExactlyElementsIn(Arrays.asList());
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(ImmutableList.of(1, 2, 3));
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(new Integer[] {1, 2, 3});
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(new Integer[] {1, 2, 3,});
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(new Integer[] {});
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(Arrays.asList( /* a */ 1, 2 /* b */ ));
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(java.util.Arrays.asList(1, 2));
  }

  @SuppressWarnings("TruthContainsExactlyElementsInUsage")
  void suppressed() {
    assertThat(ImmutableList.of(1, 2, 3)).containsExactlyElementsIn(Arrays.asList(1, 2, 3));
  }
}
