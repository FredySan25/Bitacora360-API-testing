import type { AllureConfig } from "allure";

// Settings of the Allure report that "npm run report:allure" and CI generate
// from the allure-results folder written by the Playwright reporter
export default {
  name: "Bitácora360 · Pruebas de API",
  output: "./allure-report",
  // One line per generated report. CI brings the file back from the published
  // site, which is what draws the trend between runs
  historyPath: "./allure-history.jsonl",
  historyLimit: 30,
  plugins: {
    awesome: {
      options: {
        reportLanguage: "es",
        // Playwright project, spec file and describe block
        groupBy: ["parentSuite", "suite", "subSuite"],
      },
    },
  },
} satisfies AllureConfig;
