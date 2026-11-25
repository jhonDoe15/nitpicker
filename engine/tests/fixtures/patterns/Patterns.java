package fixtures.patterns;

import java.util.Iterator;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

public class Patterns {
    sealed interface Shape permits Shape.Dot, Shape.Line, Shape.Box {
        record Dot() implements Shape {}
        record Line(Node name, int length) implements Shape {}
        record Box(Shape inside) implements Shape {}
    }

    static class Node {}

    static class Leaf extends Node {
        Node parent() {
            return this;
        }
    }

    interface Writer {
        String write(String out, int depth);
    }

    void qualifiedRecordPatterns(Shape shape) {
        switch (shape) {
            case Shape.Dot() -> System.out.println("dot");
            case Shape.Line(var name, var length) -> System.out.println(name);
            case Shape.Box(Shape.Line(Node name, int length)) -> System.out.println(name);
            case Shape.Box(var inside) -> System.out.println(inside);
        }
        switch (shape) {
            case Shape.Dot dot -> System.out.println(dot);
            case Shape.Line line -> System.out.println(line);
        }
    }

    Optional<Node> patternVariableInLambda(Node node, Optional<Node> found) {
        return switch (node) {
            case Leaf leaf -> {
                Optional<Node> pruned = found;
                yield pruned.map(other -> other == leaf.parent() ? leaf : other);
            }
            default -> Optional.of(node);
        };
    }

    boolean recordComponents(Object value, Node other) {
        if (value instanceof Shape.Line(var name, var length) && name == other) {
            return length > 0;
        }
        return switch (value) {
            case Shape.Line(Node name, var length) when name == other -> true;
            case Leaf leaf when leaf == other -> true;
            case Leaf leaf -> leaf == other;
            default -> false;
        };
    }

    static <T> Iterator<T> single(T element) {
        return null;
    }

    @SafeVarargs
    static <T> Iterator<T> concat(Iterator<? extends T>... parts) {
        return null;
    }

    static <U> Iterator<U> lazy(Function<String, Iterator<? extends U>> fn) {
        return null;
    }

    static void sink(Iterator<? extends Writer> writers) {}

    void inferenceLeftUnfinished() {
        sink(lazy(key -> concat(single((out, depth) -> out), single((out, depth) -> out))));
    }
}
