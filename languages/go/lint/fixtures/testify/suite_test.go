package testify

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/suite"
)

type ShopSuite struct {
	suite.Suite
}

func TestShopSuite(t *testing.T) {
	suite.Run(t, new(ShopSuite))
}

func (s *ShopSuite) TestParallel() {
	s.T().Parallel() // want suite-broken-parallel
	s.Equal("SHOP", strings.ToUpper("shop"))
}

func (s *ShopSuite) TestPackageAssert() {
	assert.Equal(s.T(), "SHOP", strings.ToUpper("shop")) // want suite-dont-use-pkg
	s.Equal("SHOP", strings.ToUpper("shop"))
}

func (s *ShopSuite) TestExtraAssertCall() {
	s.Assert().Equal("SHOP", strings.ToUpper("shop")) // want suite-extra-assert-call
	s.Equal("SHOP", strings.ToUpper("shop"))
}

func (s *ShopSuite) TestSubtests() {
	s.T().Run("name", func(t *testing.T) { // want suite-subtest-run
		t.Helper()
	})
	s.Run("name", func() {
		s.checkName("shop")
	})
}

func (s *ShopSuite) checkName(name string) {
	s.T().Helper()
	s.NotEmpty(name)
}

func (s *ShopSuite) checkLength(name string) { // want suite-thelper
	s.NotEmpty(name)
}

func (s *ShopSuite) TestLength() {
	s.checkLength("shop")
}

func (s *ShopSuite) TestWithArgument(name string) { // want suite-method-signature
	s.NotEmpty(name)
}
