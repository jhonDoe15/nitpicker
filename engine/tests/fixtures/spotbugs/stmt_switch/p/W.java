package p;
import java.util.*;
public class W {
    int x;
    Iterator<Object> it;
    void w1(String s) {
        switch (s) {
            case "a":
                while (it.hasNext()) {
                    x++;
                }
                break;
            case "b":
                x = 2;
                break;
        }
    }
    void w2(String s) {
        switch (s) {
            case "a":
                while (it.hasNext()) {
                    if (x > 0) {
                        x++;
                    } else {
                        Object o = it.next();
                        if (o != null) {
                            String t = o.toString();
                            x = t.length();
                        }
                    }
                }
                break;
            case "b":
                x = 2;
                break;
        }
    }
    void w3(String s) {
        switch (s) {
            case "a":
                while (it.hasNext()) {
                    if (x > 0) {
                        x++;
                    } else {
                        Object o = it.next();
                        x = o.hashCode();
                    }
                }
                break;
            case "b":
                x = 2;
                break;
        }
    }
    void w4(String s) {
        switch (s) {
            case "a":
                while (it.hasNext()) {
                    if (x > 0) {
                        x++;
                    } else {
                        x--;
                    }
                }
                break;
            case "b":
                x = 2;
                break;
        }
    }
    void w5(String s) {
        switch (s) {
            case "a":
                while (it.hasNext()) {
                    Object o = it.next();
                    x = o.hashCode();
                }
                break;
            case "b":
                x = 2;
                break;
        }
    }
    void w6(int s) {
        switch (s) {
            case 1:
                while (it.hasNext()) {
                    if (x > 0) {
                        x++;
                    } else {
                        Object o = it.next();
                        if (o != null) {
                            String t = o.toString();
                            x = t.length();
                        }
                    }
                }
                break;
            case 2:
                x = 2;
                break;
        }
    }
}
