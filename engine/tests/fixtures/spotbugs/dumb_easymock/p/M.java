package p;

import org.easymock.EasyMock;

public class M {
    Object o = new Object();

    void v0() {
        EasyMock.verify();
    }

    void r0() {
        EasyMock.replay();
    }

    void re0() {
        EasyMock.reset();
    }

    void v1() {
        EasyMock.verify(o);
    }

    void r1() {
        EasyMock.replay(o);
    }

    void va() {
        EasyMock.verify(new Object[0]);
    }

    void vn() {
        EasyMock.verify((Object[]) null);
    }

    void rs() {
        EasyMock.resetToDefault();
    }

    void rn() {
        EasyMock.resetToNice();
    }

    void rst() {
        EasyMock.resetToStrict();
    }

    void vu() {
        EasyMock.verifyUnexpectedCalls();
    }

    void vr() {
        EasyMock.verifyRecording();
    }

    void ctl() {
        org.easymock.EasyMock.createControl().verify();
    }

    void arr() {
        Object[] a = {}; EasyMock.verify(a);
    }

}
