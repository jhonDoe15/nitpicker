const RATE = `package shop

func Rate(amount int) int {
	if amount > 10 {
		return 2
	}
	return 1
}
`;

function rateTest(checks) {
  return `package shop

import "testing"

func TestRate(t *testing.T) {
${checks.map((check) => `\tif ${check} {\n\t\tt.Fatal("wrong rate")\n\t}`).join('\n')}
}
`;
}

const RATE_TEST = rateTest(['Rate(20) != 2', 'Rate(10) != 1', 'Rate(5) != 1']);
export const WEAKER_RATE_TEST = rateTest(['Rate(20) != 2', 'Rate(5) != 1']);

const POSITIVE = `package shop

func Above(n int) int {
	if n > 0 {
		return 1
	}
	return 0
}

func Bonus(n int) int {
	if n > 0 {
		return 2
	}
	return 0
}
`;

export const POSITIVE_TEST = `package shop

import "testing"

func TestPositive(t *testing.T) {
	if Above(1) != 1 || Above(0) != 0 || Bonus(5) != 2 {
		t.Fatal("wrong value")
	}
}
`;

export const MUTATION_BASE = {
  'go.mod': 'module example.com/shop\n\ngo 1.22\n',
  'nitpicker.config.json': '{ "preset": "go" }\n',
  'shop/rate.go': RATE,
  'shop/rate_test.go': RATE_TEST,
  'shop/positive.go': POSITIVE,
  'shop/positive_test.go': POSITIVE_TEST,
  'shop/legacy.go': `package shop

func Legacy(a, b int) int {
	return a + b
}
`,
};

export const FEE = `package shop

func Fee(total int) int {
	if total > 100 {
		return 5
	}
	return 0
}
`;

function feeTest(checks) {
  return `package shop

import "testing"

func TestFee(t *testing.T) {
${checks.map((check) => `\tif ${check} {\n\t\tt.Fatal("wrong fee")\n\t}`).join('\n')}
}
`;
}

export const FEE_HALF_TEST = feeTest(['Fee(200) != 5', 'Fee(0) != 0']);
export const FEE_TEST = feeTest(['Fee(200) != 5', 'Fee(100) != 0', 'Fee(0) != 0']);

export const BROKEN_TEST = `package shop

import "testing"

func TestBroken(t *testing.T) {
	if Rate(0) != 0 {
		t.Fatal("still broken")
	}
}
`;
