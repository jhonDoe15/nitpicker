export const ESCAPING_FILES = {
  'internal/checkout/pay.go': `package checkout

import "shop/internal/orders"

func Pay(cart *orders.Cart) {
	lines := cart.Lines()
	lines[0] = "free"
}
`,
};

export const COPYING_FILES = {
  'internal/checkout/pay.go': `package checkout

import "shop/internal/orders"

func Pay(cart *orders.Cart) {
	lines := cart.Snapshot()
	lines[0] = "free"
	_ = append(cart.Lines(), "extra")
}
`,
};

const PLACE = `package orders

import (
	"shop/internal/app"
	"shop/internal/billing"
)

func Place(ctx *app.Context, id string) int {
	return billing.Charge(ctx, id)
}
`;

const CHARGE = `package billing

import "shop/internal/app"

func Charge(ctx *app.Context, id string) int {
	return ctx.Clock() + Rate(ctx, id)
}
`;

export const THREADING_FILES = {
  'internal/orders/place.go': PLACE,
  'internal/billing/charge.go': CHARGE,
  'internal/billing/rate.go': `package billing

import "shop/internal/app"

func Rate(ctx *app.Context, id string) int {
	return ctx.Rates[id]
}
`,
};

export const WIDE_THREADING_FILES = {
  'internal/orders/place.go': PLACE,
  'internal/billing/charge.go': CHARGE,
  'internal/billing/rate.go': `package billing

import "shop/internal/app"

func Rate(ctx *app.Context, id string) int {
	return ctx.Rates[id] + len(ctx.DB) + len(ctx.Logger)
}
`,
};
