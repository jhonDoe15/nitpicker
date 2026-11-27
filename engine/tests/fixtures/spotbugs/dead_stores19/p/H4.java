package p;

public class H4 {
    void f1(Object p) {
        try {
            p.notify();
        } finally { Object r = new Object(); }
        p.hashCode();
    }
    void f2(Object p) {
        try {
            p.notify();
        } finally {
            Object r = new Object(); }
        p.hashCode();
    }
    void f3(Object p) {
        try {
            p.notify(); Object r = new Object();
        } finally {
            p.hashCode();
        }
        p.hashCode();
    }
    void f4(Object p) {
        try {
            p.notify(); } finally { Object r = new Object();
            p.hashCode();
        }
        p.hashCode();
    }
    void f5(Object p) {
        try {
            p.notify(); Object r = new Object(); } finally {
            p.hashCode();
        }
        p.hashCode();
    }
    void f6(Object p) {
        synchronized (p) {
            p.notify(); return; } }
    void f7(Object p) {
        synchronized (p) {
            Object r = new Object(); if (r != p) return; } Object r = new Object();
        p.hashCode();
    }
    void f8(Object p) {
        synchronized (p) {
            p.notify(); } Object r = new Object(); }
    void f9(Object p) {
        for (int i = 0; i < 2; i++) { synchronized (p) { Object r = new Object(); } }
    }
    void g1(Object p) {
        for (int i = 0; i < 2; i++) { synchronized (p) { Object r = new Object(); } }
        p.hashCode();
    }
}
