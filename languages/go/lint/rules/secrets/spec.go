package secrets

const (
	secretValueLength      = 6
	secretCharacterClasses = 3
	passphraseLength       = 8
)

var (
	secretNameWords = []string{
		`password`,
		`passwd`,
		`pwd`,
		`passphrase`,
		`secret`,
		`token`,
		`credentials?`,
		`apikey`,
		`privatekey`,
		`accesskey`,
		`secretkey`,
		`authkey`,
		`signingkey`,
		`encryptionkey`,
		`hmackey`,
		`jwtkey`,
	}
	secretValueSuffixes = []string{
		`value`,
		`raw`,
		`str`,
		`string`,
		`text`,
		`plain`,
	}
	markerTokenWords = []string{
		`eos`,
		`bos`,
		`pad`,
		`unk`,
		`cls`,
		`sep`,
		`mask`,
		`next`,
		`page`,
		`continuation`,
		`cancellation`,
	}
	maskedNameWords = []string{
		`masked`,
		`redacted`,
	}
	passphraseNameWords = []string{
		`password`,
		`passwd`,
		`passphrase`,
	}
	placeholderPatterns = []string{
		`\*+\w{0,4}`,
		`x+`,
		`<.*>`,
		`\[.*\]`,
		`\$\{.*\}`,
		`\$[a-z_]\w*`,
		`\{\{.*\}\}`,
		`\{\w*\}`,
		`%s`,
		`%\(\w+\)s`,
		`:[a-z_]+`,
		`changeme`,
		`change-me`,
		`todo`,
		`example`,
		`dummy`,
		`placeholder`,
		`redacted`,
		`none`,
		`null`,
		`undefined`,
		`your[-_ ].*`,
	}
	notSecretPatterns = []string{
		`[A-Z][A-Z0-9_]+`,
		`[A-Za-z]+(?:[._:/-][A-Za-z]+)+`,
		`[a-z][a-z0-9_-]*(?:[./][a-z0-9_-]+)+`,
		`(?:~|\.{1,2})?(?:/[\w.-]+)+/?`,
		`\^.*\$`,
		`\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?`,
	}
	identifierPatterns = []string{
		`[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+`,
		`[a-z]+(?:[A-Z][a-z0-9]*)+`,
	}
	credentialShapes = []string{
		`\bAKIA[0-9A-Z]{16}\b`,
		`\bgh[pousr]_[A-Za-z0-9]{30,}`,
		`\bxox[abprs]-[A-Za-z0-9-]{10,}`,
		`-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----`,
		`\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}`,
		`\bsk-(?:proj|ant|live|test)-[A-Za-z0-9_-]{20,}`,
		`\bdjango-insecure-\S{6,}`,
	}
	embeddedSecretPatterns = []string{
		`^(?:jdbc:)?[a-z][a-z0-9+.-]*://[^\s/:@]+:([^\s/@]+)@`,
		`^(?:bearer|basic|token)\s+(\S+)$`,
		`[?&;]password=([^&;\s]+)`,
	}
)
