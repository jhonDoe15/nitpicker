package shop;

import java.util.List;

public record Filter(
    String tag,
    List<String> tags, // violation: SingularAndPluralMember
    String category,
    List<Long> categories) {}
