package p;
public class T {
    int x;
    void t1(int i, int j) {
        switch (j) {
            case 1: x += 1;
            case 2: x += 2; break;
            default: x += 7;
        }
        switch (i) {
            case 1: x += 1;
            case 9: x += 9; break;
            default: x += 6;
        }
    }
    void u1(int i) {
        switch (i) {
            case 1: x += 1;
            case 9: x += 9; break;
            default: x += 6;
        }
    }
    void t2(int i, int j) {
        switch (j) {
            case 1: x += 1;
            case 2: x += 2; break;
            default: x += 7;
        }
        switch (i) {
            case 1: x += 1;
            case 2: x += 2;
            case 9: x += 9; break;
            default: x += 6;
        }
    }
    void u2(int i) {
        switch (i) {
            case 1: x += 1;
            case 2: x += 2;
            case 9: x += 9; break;
            default: x += 6;
        }
    }
    void t3(int i, int j) {
        switch (j) {
            case 1: x += 1;
            case 2: x += 2; break;
            default: x += 7;
        }
        switch (i) {
            case 1: x += 1;
            case 2: x += 2;
            case 3: x += 3;
            case 9: x += 9; break;
            default: x += 6;
        }
    }
    void u3(int i) {
        switch (i) {
            case 1: x += 1;
            case 2: x += 2;
            case 3: x += 3;
            case 9: x += 9; break;
            default: x += 6;
        }
    }
    void t4(int i, int j) {
        switch (j) {
            case 1: x += 1;
            case 2: x += 2; break;
            default: x += 7;
        }
        switch (i) {
            case 1: x += 1;
            case 2: x += 2;
            case 3: x += 3;
            case 4: x += 4;
            case 9: x += 9; break;
            default: x += 6;
        }
    }
    void u4(int i) {
        switch (i) {
            case 1: x += 1;
            case 2: x += 2;
            case 3: x += 3;
            case 4: x += 4;
            case 9: x += 9; break;
            default: x += 6;
        }
    }
}
