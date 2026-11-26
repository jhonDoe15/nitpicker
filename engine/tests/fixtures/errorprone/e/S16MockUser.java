import org.mockito.Mock;

class S16MockUser extends S16MockBase {
    void fields(S16MockBase base, S16MockUser user) {
        inherited.test();
        this.inherited.test();
        super.inherited.test();
        packaged.test();
        base.packaged.test();
        user.inherited.test();
        shared.test();
        S16MockBase.shared.test();
        inheritedDeep.test();
        plain.test();
        base.plain.test();
        inherited.fin();
        Object o = inherited.test();
    }

    void locals(@Mock S16Mock param, @Mock(answer = "deep") S16Mock deepParam, S16Mock plainParam) {
        param.test();
        deepParam.test();
        plainParam.test();
        @Mock S16Mock local = null;
        local.test();
        @Mock(answer = "deep") S16Mock deepLocal = null;
        deepLocal.test();
        @org.mockito.Mock S16Mock qualified = null;
        qualified.test();
        for (@Mock S16Mock each : new S16Mock[0]) {
            each.test();
        }
        java.util.function.Consumer<S16Mock> consumer = (@Mock S16Mock lambdaParam) -> lambdaParam.test();
        try {
        } catch (RuntimeException e) {
        }
    }

    @SuppressWarnings("DirectInvocationOnMock")
    void suppressed() {
        inherited.test();
    }
}
