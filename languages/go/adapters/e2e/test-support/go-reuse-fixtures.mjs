const CLAMP = `func clamp(value, low, high int) int {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}
`;

const BILLING = `package billing

func Total(amount int) int {
	return clamp(amount, 0, 100)
}

${CLAMP}`;

const REPORT = `package report

func Score(points int) int {
	return points * 2
}
`;

const MAIN = `package main

import (
	"fmt"

	"shop/internal/billing"
	"shop/internal/report"
)

func main() {
	fmt.Println(billing.Total(5), report.Score(3))
}
`;

const REPORT_WITH_CLAMP = `package report

func Score(points int) int {
	return clamp(points*2, 0, 10)
}

${CLAMP}`;

const BILLING_TEST = `package billing

import "testing"

func TestTotal(t *testing.T) {
	for amount, want := range map[int]int{-1: 0, 5: 5, 200: 100} {
		if got := Total(amount); got != want {
			t.Errorf("Total(%d) = %d, want %d", amount, got, want)
		}
	}
}
`;

const REPORT_TEST = `package report

import "testing"

func TestScoreStaysInRange(t *testing.T) {
	scores := []int{Score(-1), Score(2), Score(9)}
	if scores[0] != 0 || scores[1] != 4 || scores[2] != 10 {
		t.Fatalf("scores %v", scores)
	}
}
`;

export const REUSE_FILES = {
  'go.mod': 'module shop\n\ngo 1.22\n',
  'nitpicker.config.json': '{ "preset": "go" }\n',
  'cmd/shop/main.go': MAIN,
  'internal/billing/total.go': BILLING,
  'internal/billing/total_test.go': BILLING_TEST,
  'internal/report/score.go': REPORT,
};

export const COPIED_FILES = {
  'internal/report/score.go': REPORT_WITH_CLAMP,
  'internal/report/score_test.go': REPORT_TEST,
};

export const BILLING_EDITED = BILLING.replace(CLAMP, CLAMP.replaceAll('value', 'number'));
