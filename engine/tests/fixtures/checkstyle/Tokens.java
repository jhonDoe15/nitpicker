package fixtures.checkstyle;

public class Tokens {
    //no space here
    // fine comment
    ///
    // TODO: done right
    // todo: lower case
    /*
     ***********
     */
    private String escaped = "\u0041";
    private String control = "\u0000";
    private String commented = "\u0042"; // letter B
    private String octal = "\011";
    private String tab = "\u0009";
    private char quote = '\u0027';
    private String block = """
        \u0043
        """;
    private String accented = """
        café \" 日本
        """;
}
