import { writeFileSync, readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
writeFileSync(
  'src/_version.ts',
  `// auto-generated\nexport const PLUGIN_VERSION=${JSON.stringify(pkg.version)};\n`,
)
