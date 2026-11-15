import { readFile } from "node:fs/promises";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isRelativeImport = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExplicitExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
    if (!isRelativeImport || hasExplicitExtension || error?.code !== "ERR_MODULE_NOT_FOUND") {
      throw error;
    }

    for (const extension of [".ts", ".tsx"]) {
      try {
        return await nextResolve(`${specifier}${extension}`, context);
      } catch {
        // Keep trying the next TypeScript source extension.
      }
    }

    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json") && !context.importAttributes?.type) {
    const json = await readFile(new URL(url), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${json};`
    };
  }

  if (!url.endsWith(".ts") && !url.endsWith(".tsx")) {
    return nextLoad(url, context);
  }

  const source = await readFile(new URL(url), "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: new URL(url).pathname,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      isolatedModules: true
    }
  });

  return {
    format: "module",
    shortCircuit: true,
    source: transpiled.outputText
  };
}
