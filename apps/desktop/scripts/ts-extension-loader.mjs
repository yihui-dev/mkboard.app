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
