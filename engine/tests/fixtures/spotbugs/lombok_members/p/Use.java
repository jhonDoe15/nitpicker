package p;

import java.util.HashMap;
import java.util.Map;
import lombok.val;

public class Use {
    void a(Holder h) {
        synchronized (h.getLock()) { h.isOpen(); h.isShut(); }
    }
    void b(Holder h) {
        synchronized (h.getCache()) { }
    }
    void c(Holder.Box box) {
        synchronized (box.getInner()) { }
        synchronized (box.getCounts()) { }
    }
    void d(Holder.Frozen frozen) {
        synchronized (frozen.getFrozen()) { }
    }
    void e(Holder.Plain plain) {
        synchronized (plain.getOwn()) { }
        synchronized (plain.getHidden()) { }
    }
    void f() {
        val map = new HashMap<String, String>();
        for (val key : map.keySet()) {
            System.out.println(map.get(key));
        }
    }
    void g() {
        var map = new HashMap<String, String>();
        for (var key : map.keySet()) {
            System.out.println(map.get(key));
        }
    }
    void h(Map<String, String> source) {
        val copy = source;
        for (String key : copy.keySet()) {
            System.out.println(copy.get(key));
        }
    }
}
