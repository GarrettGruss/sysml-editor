/** Example vscode-free module. */
export function isSysmlFile(path: string): boolean {
  return /\.(sysml|kerml)$/i.test(path);
}
