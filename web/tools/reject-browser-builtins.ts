import { isBuiltin } from "node:module";
import type { Plugin } from "vite";

/** Fail browser builds rather than replacing a Node builtin with a browser stub. */
export function rejectBrowserBuiltins(): Plugin {
  return {
    name: "reject-browser-builtins",
    enforce: "pre",
    resolveId(source, importer) {
      if (isBuiltin(source)) {
        this.error(
          `Browser build cannot import Node builtin ${source} from ${importer ?? "an entry"}.`,
        );
      }
      return null;
    },
  };
}
