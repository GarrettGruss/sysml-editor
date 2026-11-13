/** URI scheme of standard-library documents; they are read-only. */
export const LIBRARY_URI_SCHEME = "sysml-library";

export function isLibraryUri(uri: string): boolean {
  return uri.startsWith(LIBRARY_URI_SCHEME + ":");
}
