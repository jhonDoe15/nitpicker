package demo

import io.kotest.core.spec.style.FunSpec
import io.kotest.matchers.shouldBe

class CalcSpec :
    FunSpec({
        context("twice") {
            test("doubles the value") {
                Calc().twice(3) shouldBe 6
            }
        }
        test("calls plusOne") {
            Calc().plusOne(1)
        }
    })
