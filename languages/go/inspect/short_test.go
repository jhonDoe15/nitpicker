package main

import (
	"reflect"
	"testing"
)

const shortGuards = `package demo

import "testing"

func TestSkips(t *testing.T) {
	t.Parallel()
	if testing.Short() {
		t.Skip("integration")
	}
}

func TestReturns(t *testing.T) {
	if testing.Short() {
		return
	}
}

func TestWraps(t *testing.T) {
	if !testing.Short() {
		t.Log("slow part")
	}
}

func TestLogsOnly(t *testing.T) {
	if testing.Short() {
		t.Log("short")
	}
}

func TestThrowsAway(t *testing.T) {
	_ = testing.Short()
}

func TestSkipsLate(t *testing.T) {
	t.Log("slow part")
	if testing.Short() {
		t.Skip("too late")
	}
}

func TestWrapsPart(t *testing.T) {
	t.Log("slow part")
	if !testing.Short() {
		t.Log("rest")
	}
}

func TestSkipsOtherRunner(t *testing.T) {
	other := t
	if testing.Short() {
		other.Skip("not the runner")
	}
}

func TestSkipsOnEither(t *testing.T) {
	if testing.Short() || len("ci") == 0 {
		t.Logf("integration")
		t.Skipf("needs %s", "a database")
	}
}

func TestSkipsOnBoth(t *testing.T) {
	if testing.Short() && len("ci") == 0 {
		t.Skip("integration")
	}
}

func TestRunsBeforeReturn(t *testing.T) {
	if testing.Short() {
		t.Run("slow", func(t *testing.T) {})
		return
	}
}

func TestWrapsWithSkip(t *testing.T) {
	if !testing.Short() {
		t.Log("slow part")
	} else {
		t.SkipNow()
	}
}

func TestWrapsWithWork(t *testing.T) {
	if !testing.Short() {
		t.Log("slow part")
	} else {
		t.Run("slow", func(t *testing.T) {})
	}
}

func TestSkipsWithInit(t *testing.T) {
	if short := testing.Short(); short {
		t.Skip("init form")
	}
}
`

const aliasedGuard = `package demo

import check "testing"

func TestAliased(t *check.T) {
	if check.Short() {
		t.SkipNow()
	}
}

func TestOtherShort(t *check.T) {
	if testing.Short() {
		t.SkipNow()
	}
}
`

func shortSkips(report Report) map[string]bool {
	skips := map[string]bool{}
	for _, test := range report.Tests {
		skips[test.Name] = test.ShortSkip
	}
	return skips
}

func TestMarksOnlyTestsThatSkipUnderShortMode(t *testing.T) {
	report := inspected(t, map[string]string{
		"go.mod":        "module demo\n",
		"guard_test.go": shortGuards,
		"alias_test.go": aliasedGuard,
	})
	want := map[string]bool{
		"TestSkips": true, "TestReturns": true, "TestWraps": true, "TestLogsOnly": false,
		"TestThrowsAway": false, "TestSkipsLate": false, "TestWrapsPart": false,
		"TestSkipsOtherRunner": false, "TestSkipsWithInit": false, "TestSkipsOnEither": true,
		"TestSkipsOnBoth": false, "TestRunsBeforeReturn": false, "TestWrapsWithSkip": true,
		"TestWrapsWithWork": false,
		"TestAliased":       true, "TestOtherShort": false,
	}
	if got := shortSkips(report); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
