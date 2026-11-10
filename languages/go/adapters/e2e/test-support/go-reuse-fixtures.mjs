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

export const REUSE_FILES = {
  'go.mod': 'module shop\n\ngo 1.22\n',
  'nitpicker.config.json': '{ "preset": "go", "disable": ["mutation"] }\n',
  'cmd/shop/main.go': MAIN,
  'internal/billing/total.go': BILLING,
  'internal/report/score.go': REPORT,
};

export const COPIED_FILES = { 'internal/report/score.go': REPORT_WITH_CLAMP };

export const BILLING_EDITED = BILLING.replace(CLAMP, CLAMP.replaceAll('value', 'number'));
