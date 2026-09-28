import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'

/** Execute the actual module with external I/O ports supplied by each test. */
export function loadModule<T>(path: string, ports: Record<string, unknown>, expose = ''): T {
  const filename = resolve(path)
  const source = ts.transpileModule(readFileSync(filename, 'utf8') + '\n' + expose, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText
  const module = { exports: {} }
  const require = createRequire(filename)
  new Function('require', 'module', 'exports', source)(
    (name: string) => Object.hasOwn(ports, name) ? ports[name] : require(name), module, module.exports
  )
  return module.exports as T
}
