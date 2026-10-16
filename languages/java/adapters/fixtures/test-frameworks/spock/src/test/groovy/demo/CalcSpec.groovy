package demo

import spock.lang.Specification

class CalcSpec extends Specification {
    def "doubles the value"() {
        expect:
        new Calc().twice(3) == 6
    }
}
