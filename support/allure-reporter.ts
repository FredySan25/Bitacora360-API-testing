import path from "node:path";
import type { Suite, TestCase } from "@playwright/test/reporter";
import AllureReporter from "allure-playwright";
import { REPORT_SUITES } from "./report-suites";

const TESTS_DIR = path.resolve(__dirname, "../tests");

function specKey(test: TestCase): string {
  return path.relative(TESTS_DIR, test.location.file).split(path.sep).join("/");
}

/**
 * The Allure reporter with readable section names. By default it groups the
 * report by Playwright project and file path ("auth", "auth/login.spec.ts");
 * this one takes the names from REPORT_SUITES. They go in as annotations
 * because Allure reads them when a test begins, also for a skipped one, and
 * they come out right after so that the Playwright report does not show them.
 */
export default class ReadableAllureReporter extends AllureReporter {
  // A spec without a name fails the run, so that it does not reach the
  // report as a path
  onBegin(suite: Suite) {
    super.onBegin(suite);
    const missing = [...new Set(suite.allTests().map(specKey))].filter(
      (key) => !(key in REPORT_SUITES),
    );
    if (missing.length > 0) {
      throw new Error(
        `Add these files to support/report-suites.ts so that the report names them: ${missing.join(", ")}`,
      );
    }
  }

  onTestBegin(test: TestCase) {
    const names = REPORT_SUITES[specKey(test)];
    if (!names) {
      super.onTestBegin(test);
      return;
    }
    const labels = [
      { type: "allure.label.parentSuite", description: names.area },
      { type: "allure.label.suite", description: names.feature },
    ];
    test.annotations.push(...labels);
    try {
      super.onTestBegin(test);
    } finally {
      test.annotations.splice(-labels.length);
    }
  }
}
