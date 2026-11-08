package shop.queries;

public final class SqlTexts {
  public static final String RECENT = "select id, name from account where active limit 20"; // violation: UnorderedQuery
  public static final String RECENT_SORTED = """
      select id, name from account
      where active
      order by created_at desc, id
      limit 20
      """;
  public static final String PAGE = "select id from account where owner = ? " + "offset ? limit ?"; // violation: UnorderedQuery
  public static final String TAGS = "select a.id, array_agg(t.name) from account a join tag t on t.account = a.id group by a.id"; // violation: UnorderedQuery
  public static final String SORTED_TAGS = "select a.id, json_agg(t.name order by t.name) from account a join tag t on t.account = a.id group by a.id";
  public static final String EXISTS = "select 1 from account where name = ? limit 1";
  public static final String NOTE = "Shows at most 20 rows; raise the limit in settings.";

  private SqlTexts() {}
}
