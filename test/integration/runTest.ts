import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";

/**
 * Runs the integration tests in a downloaded VS Code. By default the extension loads from the
 * working tree (extensionDevelopmentPath). With SYSML_VSIX=<file> the packaged .vsix is installed
 * into a fresh extensions directory and the same tests run against the INSTALLED extension; the
 * development path then points at a stub that contributes nothing.
 */
async function main(): Promise<void> {
  const root = path.resolve(__dirname, "../../..");
  const version = process.env.VSCODE_VERSION || undefined;
  const workspace = path.join(root, "test/fixtures/workspace-basic");
  const artifacts = process.env.SYSML_TEST_ARTIFACTS ? path.resolve(process.env.SYSML_TEST_ARTIFACTS) : path.join(root, "out/test-artifacts");
  const common = ["--disable-workspace-trust", "--no-sandbox", "--disable-gpu"];
  const vsix = process.env.SYSML_VSIX ? path.resolve(process.env.SYSML_VSIX) : undefined;

  if (!vsix) {
    await runTests({
      version,
      extensionDevelopmentPath: root,
      extensionTestsPath: path.resolve(__dirname, "index"),
      launchArgs: [workspace, "--disable-extensions", ...common],
      extensionTestsEnv: { SYSML_EXPECT_EXTENSION_PATH: root, SYSML_TEST_ARTIFACTS: artifacts },
    });
    return;
  }

  const tmp = mkdtempSync(path.join(os.tmpdir(), "sysml-installed-"));
  const extensionsDir = path.join(tmp, "extensions");
  const userDataDir = path.join(tmp, "user-data");
  const stub = path.join(tmp, "stub");
  mkdirSync(stub, { recursive: true });
  writeFileSync(path.join(stub, "package.json"), JSON.stringify({ name: "sysml-test-stub", version: "0.0.0", publisher: "test", engines: { vscode: "*" } }));

  const vscodeExecutablePath = await downloadAndUnzipVSCode(version);
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const install = spawnSync(cli!, [...cliArgs, "--extensions-dir", extensionsDir, "--user-data-dir", userDataDir, "--install-extension", vsix], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  process.stdout.write(install.stdout ?? "");
  process.stderr.write(install.stderr ?? "");
  if (install.status !== 0) throw new Error(`installing ${vsix} failed with status ${install.status}`);

  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: stub,
    extensionTestsEnv: { SYSML_EXPECT_EXTENSIONS_DIR: extensionsDir, SYSML_TEST_ARTIFACTS: artifacts },
    extensionTestsPath: path.resolve(__dirname, "index"),
    launchArgs: [workspace, "--extensions-dir", extensionsDir, "--user-data-dir", userDataDir, ...common],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
