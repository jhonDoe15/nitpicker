package com.google.common.math;

public final class DoubleMath {
    private DoubleMath() {}

    public static boolean fuzzyEquals(double a, double b, double tolerance) {
        return Math.abs(a - b) <= tolerance;
    }
}
