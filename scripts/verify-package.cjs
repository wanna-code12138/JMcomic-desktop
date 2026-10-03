// Validate Node's dependency lookup inside app.asar, without project/global fallbacks.
const { resolve, posix, sep } = require('node:path')
const asar = require('@electron/asar')
const semver = require('semver')

function verifyPackage(archive) {
  const files = new Set(asar.listPackage(archive).map(file => file.replaceAll('\\', '/').replace(/^\/+/, '')))
  const read = file => JSON.parse(asar.extractFile(archive, file.split('/').join(sep)).toString('utf8'))
  const packages = [...files].filter(file => file === 'package.json' || /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(file))
  const errors = []
  let edges = 0
  for (const file of packages) {
    const manifest = read(file)
    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      if (manifest.optionalDependencies?.[name] || name.startsWith('@types/')) continue
      edges++
      let directory = posix.dirname(file), found
      while (true) {
        const candidate = posix.join(directory, 'node_modules', name, 'package.json')
        if (files.has(candidate)) { found = candidate; break }
        if (directory === '.') break
        directory = posix.dirname(directory)
      }
      if (!found) errors.push(`${file}: missing ${name}@${range}`)
      else if (semver.validRange(range) && !semver.satisfies(read(found).version, range)) {
        errors.push(`${file}: ${name}@${range} resolves to incompatible ${read(found).version} at ${found}`)
      }
    }
  }
  return { archive:resolve(archive), packages:packages.length, requiredDependencyEdges:edges, errors }
}

module.exports = { verifyPackage }
if (require.main === module) {
  const report = verifyPackage(resolve(process.argv[2] ?? 'dist-electron/win-unpacked/resources/app.asar'))
  console.log(JSON.stringify(report, null, 2))
  if (report.errors.length) process.exitCode = 1
}
