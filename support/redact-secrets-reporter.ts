import { readFileSync, writeFileSync } from "node:fs";
import type {
  Reporter,
  TestCase,
  TestError,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";

// Access tokens of Supabase Auth, and the anon key when it is a legacy one
const JWT = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g;
// A refresh token is a short random string, only recognizable by its key
const REFRESH_TOKEN = /(refresh_token\\?["']?\s*[:=]\s*\\?["']?)[\w-]+/g;
const TEXT_ATTACHMENT = /^(text\/|application\/json)/;

/**
 * Keeps the passwords and the tokens of the test users out of the reports,
 * which the CI runs publish to GitHub Pages. They can end up in the title of a
 * step or in the message of a failed assertion, which prints what it received:
 * the answer of a sign-in, or the headers of a request. Playwright also
 * attaches that message to the failed test, as `error-context.md`.
 */
export default class RedactSecretsReporter implements Reporter {
  private readonly passwords = [
    process.env.API_USER_A_PASSWORD,
    process.env.API_USER_B_PASSWORD,
  ].filter((password): password is string => Boolean(password));

  onStepBegin(_test: TestCase, _result: TestResult, step: TestStep) {
    step.title = this.redact(step.title);
  }

  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep) {
    if (step.error) this.redactError(step.error);
  }

  onTestEnd(_test: TestCase, result: TestResult) {
    if (result.error) this.redactError(result.error);
    result.errors.forEach((error) => this.redactError(error));

    for (const attachment of result.attachments) {
      if (!TEXT_ATTACHMENT.test(attachment.contentType)) continue;

      if (attachment.body) {
        attachment.body = Buffer.from(this.redact(attachment.body.toString("utf8")));
      } else if (attachment.path) {
        // The other reporters copy the file after this one returns
        writeFileSync(attachment.path, this.redact(readFileSync(attachment.path, "utf8")));
      }
    }
  }

  private redactError(error: TestError) {
    if (error.message) error.message = this.redact(error.message);
    if (error.stack) error.stack = this.redact(error.stack);
    if (error.value) error.value = this.redact(error.value);
    if (error.cause) this.redactError(error.cause);
  }

  private redact(text: string): string {
    const withoutPasswords = this.passwords.reduce(
      (redacted, password) => redacted.replaceAll(password, "***"),
      text,
    );
    return withoutPasswords.replace(JWT, "***").replace(REFRESH_TOKEN, "$1***");
  }
}
