import { kotlinSources } from '../../__tests__/kotlin-e2e-project.mts';

export const TOUCHED_BASE = {
  [`${kotlinSources}/Picker.kt`]: `package demo

class Picker {
    fun pick(left: Int, right: Int): Int {
        if (left > right + 5) {
            return left
        }
        var total = left + right
        total = total * 2
        total = total + left
        total = total - right
        total = total / 3
        return total
    }
}
`,
  [`${kotlinSources}/Messy.kt`]: `package demo

class Messy {
    fun clamp(value: Int): Int {
        if(value>10){
            return 10
        }
        return value
    }
}
`,
  [`${kotlinSources}/Twice.kt`]: `package demo

class Twice {
    fun first(value: Int): Boolean {
        if (value == 3) {
            return true
        }
        return false
    }

    fun second(value: Int): Boolean {
        if (value == 3) {
            return true
        }
        return false
    }
}
`,
  [`${kotlinSources}/Edited.kt`]: `package demo

class Edited {
    fun check(value: Int): Boolean {
        if (value == 3) {
            return true
        }
        return false
    }
}
`,
};

export const TOUCHED_HEAD = {
  [`${kotlinSources}/Picker.kt`]: `package demo

class Picker {
    private fun spread(left: Int, right: Int): Int {
        var total = left + right
        total = total * 2
        total = total + left
        total = total - right
        total = total / 3
        return total
    }

    fun pick(left: Int, right: Int): Int {
        if (left > right + 5) {
            return left
        }
        return spread(left, right)
    }
}
`,
  [`${kotlinSources}/Messy.kt`]: `package demo

class Messy {
    fun clamp(value: Int): Int {
        if (value > 10) {
            return 10
        }
        return value
    }
}
`,
  [`${kotlinSources}/Twice.kt`]: `package demo

class Twice {
    fun first(value: Int): Boolean {
        if (value == 3) {
            return true
        }
        return false
    }

    fun middle(value: Int): Boolean {
        if (value == 3) {
            return true
        }
        return false
    }

    fun second(value: Int): Boolean {
        if (value == 3) {
            return true
        }
        return false
    }
}
`,
  [`${kotlinSources}/Edited.kt`]: `package demo

class Edited {
    fun check(value: Int): Boolean {
        if (value == 3) { // three is the only special value
            return true
        }
        return false
    }
}
`,
};
