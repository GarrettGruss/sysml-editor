import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  const root = path.resolve(__dirname, "../../..");
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.resolve(__dirname, "index"),
    launchArgs: [
      path.join(root, "test/fixtures/workspace-basic"),
      "--disable-extensions",
      "--disable-workspace-trust",
      "--no-sandbox",
      "--disable-gpu",
    ],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
