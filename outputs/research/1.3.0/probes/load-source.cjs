// Retained research helper; never imported by production code.
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function createLoader(ref) {
  const modules = new Map()
  return function load(file) {
    file = file.replaceAll('\\', '/')
    if (modules.has(file)) return modules.get(file).exports
    const source = ref
      ? execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', windowsHide: true })
      : fs.readFileSync(path.resolve(file), 'utf8')
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
    }).outputText
    const module = { exports: {} }
    modules.set(file, module)
    const localRequire = (name) => {
      if (name === 'electron') throw new Error('Electron access is forbidden in this source-only probe')
      if (name.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name)) + '.ts')
      return require(name)
    }
    new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports)
    return module.exports
  }
}
module.exports = { createLoader }
