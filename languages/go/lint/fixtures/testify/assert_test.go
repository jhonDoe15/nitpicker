package testify

import (
	"errors"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var errMissing = errors.New("missing")

func find(name string) (string, error) {
	if name == "" {
		return "", errMissing
	}
	return strings.ToUpper(name), nil
}

func TestBoolCompare(t *testing.T) {
	found := strings.HasPrefix("shop", "s")
	assert.Equal(t, true, found) // want bool-compare
	assert.True(t, found)
}

func TestCompares(t *testing.T) {
	count := len("shop")
	assert.True(t, count == 4) // want compares
	assert.Equal(t, 4, count)
}

func TestContains(t *testing.T) {
	name := "shop"
	assert.True(t, strings.Contains(name, "ho")) // want contains
	assert.Contains(t, name, "ho")
}

func TestEmpty(t *testing.T) {
	var names []string
	assert.Len(t, names, 0) // want empty
	assert.Empty(t, names)
}

func TestEncodedCompare(t *testing.T) {
	body := `{"name":"shop"}`
	assert.Equal(t, `{"name": "shop"}`, body) // want encoded-compare
	assert.JSONEq(t, `{"name": "shop"}`, body)
}

func TestEqualValues(t *testing.T) {
	count := len("shop")
	assert.EqualValues(t, 4, count) // want equal-values
	assert.Equal(t, 4, count)
}

func TestErrorIsAs(t *testing.T) {
	_, err := find("")
	assert.True(t, errors.Is(err, errMissing)) // want error-is-as
	assert.ErrorIs(t, err, errMissing)
}

func TestErrorNil(t *testing.T) {
	_, err := find("shop")
	assert.Nil(t, err) // want error-nil
	assert.NoError(t, err)
}

func TestExpectedActual(t *testing.T) {
	name, err := find("shop")
	require.NoError(t, err)
	assert.Equal(t, name, "SHOP") // want expected-actual
	assert.Equal(t, "SHOP", name)
}

func TestFloatCompare(t *testing.T) {
	ratio := float64(len("shop")) / 3
	assert.Equal(t, 1.3333, ratio) // want float-compare
	assert.InDelta(t, 1.3333, ratio, 0.001)
}

func TestFormatter(t *testing.T) {
	name, err := find("shop")
	require.NoError(t, err)
	assert.Equal(t, "SHOP", name, "name %s", name) // want formatter
	assert.Equalf(t, "SHOP", name, "name %s", name)
}

func TestLen(t *testing.T) {
	names := []string{"shop"}
	assert.Equal(t, 1, len(names)) // want len
	assert.Len(t, names, 1)
}

func TestNegativePositive(t *testing.T) {
	balance := -len("shop")
	assert.Less(t, balance, 0) // want negative-positive
	assert.Negative(t, balance)
}

func TestNilCompare(t *testing.T) {
	var names map[string]int
	assert.Equal(t, nil, names) // want nil-compare
	assert.Nil(t, names)
}

func TestRegexp(t *testing.T) {
	assert.Regexp(t, regexp.MustCompile(`^s`), "shop") // want regexp
	assert.Regexp(t, `^s`, "shop")
}

func TestRequireError(t *testing.T) {
	name, err := find("shop")
	assert.NoError(t, err) // want require-error
	assert.Equal(t, "SHOP", name)
}

func TestUselessAssert(t *testing.T) {
	name := "shop"
	assert.Equal(t, name, name) // want useless-assert
	assert.NotEmpty(t, name)
}

func TestGoRequire(t *testing.T) {
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, err := find("shop")
		require.NoError(t, err) // want go-require
	}()
	<-done
	_, err := find("shop")
	require.NoError(t, err)
}
