import path from 'node:path'

const quote = (file) => `"${file.replaceAll('"', '\\"')}"`
const joinFiles = (files) => files.map((file) => quote(path.relative(process.cwd(), file))).join(' ')
const toPosix = (file) => path.relative(process.cwd(), file).replaceAll('\\', '/')
const isPrdFile = (file) => {
  const relative = toPosix(file)
  return relative === 'prd' || relative.startsWith('prd/')
}
const isServerFile = (file) => {
  const relative = toPosix(file)
  return relative === 'apps/server' || relative.startsWith('apps/server/')
}

export default (stagedFiles) => {
  const checkableFiles = stagedFiles.filter((file) => !isPrdFile(file))
  const frontendFiles = checkableFiles.filter((file) => !isServerFile(file))
  const serverFiles = checkableFiles.filter(isServerFile)

  const frontendCode = frontendFiles.filter((file) => /\.(?:js|jsx|mjs|ts|tsx|vue)$/.test(file))
  const frontendStyle = frontendFiles.filter((file) => /\.(?:css|scss|less|postcss|vue)$/.test(file))
  const frontendFormat = frontendFiles.filter((file) =>
    /\.(?:js|jsx|mjs|ts|tsx|vue|json|md|yml|yaml|css|scss|less|postcss|html)$/.test(file)
  )
  const serverCode = serverFiles.filter((file) => /\.(?:js|jsx|mjs|ts|tsx)$/.test(file))
  const typeFiles = checkableFiles.filter((file) => /\.(?:ts|tsx|vue)$/.test(file))

  return [
    frontendFormat.length > 0 && `prettier --write ${joinFiles(frontendFormat)}`,
    frontendCode.length > 0 && `eslint --fix --max-warnings=-1 ${joinFiles(frontendCode)}`,
    frontendStyle.length > 0 && `stylelint --fix ${joinFiles(frontendStyle)}`,
    serverCode.length > 0 && `eslint --fix --max-warnings=-1 ${joinFiles(serverCode)}`,
    typeFiles.length > 0 && `node scripts/type-check-staged.mjs ${joinFiles(typeFiles)}`,
  ].filter(Boolean)
}
