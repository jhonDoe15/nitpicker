package g1

import "net/http"

func Bypassed() *http.CrossOriginProtection {
	protection := http.NewCrossOriginProtection()
	protection.AddInsecureBypassPattern("/") // want G121
	return protection
}

func Scoped() *http.CrossOriginProtection {
	protection := http.NewCrossOriginProtection()
	protection.AddInsecureBypassPattern("/webhooks/payments")
	return protection
}
