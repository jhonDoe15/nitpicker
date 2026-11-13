package g7

import (
	"net/http"
	"net/mail"
	"net/smtp"
)

func Mailed(request *http.Request) error {
	from := request.FormValue("from")
	return smtp.SendMail("127.0.0.1:25", nil, from, []string{"team@example.com"}, []byte("Subject: Hi\r\n\r\nbody")) // want G707
}

func MailedParsed(request *http.Request) error {
	from, err := mail.ParseAddress(request.FormValue("from"))
	if err != nil {
		return err
	}
	return smtp.SendMail("127.0.0.1:25", nil, from.Address, []string{"team@example.com"}, []byte("Subject: Hi\r\n\r\nbody"))
}
