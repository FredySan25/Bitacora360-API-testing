import { rmSync } from "node:fs";
import path from "node:path";

/**
 * Global setup: the Allure reporter adds its files to `allure-results` without
 * removing the ones of the previous run, which would show up in the report as
 * retries of the same tests.
 */
export default function cleanAllureResults() {
  rmSync(path.resolve(__dirname, "../allure-results"), { recursive: true, force: true });
}
