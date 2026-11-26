package g;

import java.util.ArrayList;
import java.util.List;

public class Suppressions {
    static final String SUP = "PMD.UnusedLocalVariable";
    static final String PMD_ALL = "PM" + "D";

    @SuppressWarnings("unused")
    private int unusedField;

    @SuppressWarnings("unused")
    private int usedField = 1;

    @SuppressWarnings({"PMD.UnusedLocalVariable", "PMD"})
    void both() {
        int x = 1;
    }

    @SuppressWarnings({"PMD", "PMD.UnusedLocalVariable"})
    void bothReversed() {
        int x = 1;
    }

    @SuppressWarnings({"PMD.UnusedLocalVariable", "PMD.UnusedLocalVariable"})
    void twice() {
        int x = 1;
    }

    @SuppressWarnings({"unchecked", "PMD.UnusedLocalVariable"})
    void mixed() {
        int x = 1;
    }

    @SuppressWarnings({"unchecked", "PMD.UnusedLocalVariable"})
    void mixedUnused() {
        System.out.println(usedField);
    }

    @SuppressWarnings({"all", "PMD.UnusedLocalVariable"})
    void allAndPmd() {
        int x = 1;
    }

    @SuppressWarnings(SUP)
    void constant() {
        int x = 1;
    }

    @SuppressWarnings(PMD_ALL)
    void constantAll() {
        System.out.println(usedField);
    }

    @SuppressWarnings(value = {"PMD.SystemPrintln", "PMD.UnusedLocalVariable"})
    void named() {
        int y = 2;
    }

    @SuppressWarnings("unused")
    void unusedOnMethod(int p) {
        int x = 1;
    }

    @SuppressWarnings("unused")
    void unusedOnMethodAllUsed() {
        System.out.println(usedField);
    }

    void comments() {
        int a = 1; // NOPMD
        System.out.println("x"); // NOPMD - fine
        List<String> l = new ArrayList<>(); // NOPMD
        l.add("y");
    }

    @SuppressWarnings("PMD.UnusedLocalVariable")
    void annotationAndComment() {
        int z = 3; // NOPMD
    }

    @SuppressWarnings("serial")
    static class S implements java.io.Serializable {
    }

    @SuppressWarnings("unused")
    private static class Inner {
        int v;
    }

    @SuppressWarnings("unused")
    private static class UsedInner {
        int w = 1;
        int get() { return w; }
    }

    UsedInner make() { return new UsedInner(); }

    @SuppressWarnings("unused")
    private static class Generic<T> {
    }

    @SuppressWarnings("unused")
    <T> void typeParam() {
    }

    @SuppressWarnings("unused")
    <T extends Comparable<T>> void boundParam() {
    }

    @SuppressWarnings({})
    void empty() {
    }

    @SuppressWarnings("PMD.UnknownRule")
    void unknownRule() {
    }
}
