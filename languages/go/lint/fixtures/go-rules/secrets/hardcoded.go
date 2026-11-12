package secrets

import (
	"cmp"
	"os"
)

const databaseURL = "postgres://app:Pa55w0rdX9@db.internal/orders" // want credential-shape

const apiToken = "a1b2c3d4e5f6" // want hardcoded-secret

const tokenHeader = "X-Api-Token"

type Config struct {
	Password string
	Region   string
	Token    string
}

func Load() Config {
	signingKey := cmp.Or(os.Getenv("SIGNING_KEY"), "k9Xf2LmQ7p") // want hardcoded-secret
	return Config{
		Password: "s3cretPassw0rd", // want hardcoded-secret
		Region:   "eu-west-1",
		Token:    signingKey + apiToken + databaseURL + tokenHeader,
	}
}

func Placeholder() Config {
	return Config{Password: "changeme", Token: "${TOKEN}", Region: os.Getenv("REGION")}
}

func adminPassword() string {
	return "Adm1nistrator" // want hardcoded-secret
}

func Admin() string {
	return adminPassword()
}
