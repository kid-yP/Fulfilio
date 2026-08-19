// Deliberately minimal interface so swapping in Resend/SendGrid later is a
// one-file change — nothing that calls sendMail() needs to know which provider
// is behind it. Left as a console stub per the open question on email provider.
export interface Mailer {
  sendMail(to: string, subject: string, body: string): Promise<void>;
}

export const consoleMailer: Mailer = {
  async sendMail(to, subject, body) {
    console.log(`[mailer stub] To: ${to} | Subject: ${subject}\n${body}`);
  },
};

export const mailer: Mailer = consoleMailer;
