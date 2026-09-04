import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const root = process.cwd()
const locales = ['en', 'zh-CN']
const files = Object.fromEntries(locales.map(locale => [
  locale,
  path.join(root, 'src', 'i18n', `${locale}.json`),
]))

const errors = []
const dictionaries = {}

for (const locale of locales) {
  try {
    dictionaries[locale] = JSON.parse(fs.readFileSync(files[locale], 'utf8'))
  } catch (error) {
    errors.push(`${locale}: cannot parse ${files[locale]}: ${error.message}`)
    dictionaries[locale] = {}
  }
}

function placeholders(value) {
  return [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
}

const baselineKeys = Object.keys(dictionaries.en).sort()
for (const locale of locales) {
  const dictionary = dictionaries[locale]
  const keys = Object.keys(dictionary).sort()
  for (const key of keys) {
    if (typeof dictionary[key] !== 'string' || !dictionary[key].trim()) {
      errors.push(`${locale}: ${key} must be a non-empty string`)
    }
  }
  for (const key of baselineKeys.filter(key => !(key in dictionary))) {
    errors.push(`${locale}: missing key ${key}`)
  }
  for (const key of keys.filter(key => !(key in dictionaries.en))) {
    errors.push(`${locale}: extra key ${key}`)
  }
}

for (const key of baselineKeys) {
  if (key in dictionaries['zh-CN']) {
    const enParams = placeholders(dictionaries.en[key])
    const zhParams = placeholders(dictionaries['zh-CN'][key])
    if (JSON.stringify(enParams) !== JSON.stringify(zhParams)) {
      errors.push(`placeholder mismatch for ${key}: en=[${enParams}] zh-CN=[${zhParams}]`)
    }
  }
  if (/[\u3400-\u9fff]/u.test(dictionaries.en[key] ?? '')) {
    errors.push(`en: ${key} contains Chinese characters`)
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(target) : [target]
  })
}

const sourceFiles = walk(path.join(root, 'src')).filter(file => /\.(?:ts|vue|html)$/u.test(file))
const referencedKeys = new Set()
const commandKeys = new Set()

function validateTextSelectors(file, source) {
  if (!file.endsWith('src/toolbarManager.ts') && !file.endsWith('src/ui/clickSequenceSelector.ts')) return
  for (const match of source.matchAll(/['"](text:[^'"]*)['"]/gu)) {
    const selector = match[1]
    const payload = selector.substring(5).trim()
    if (!payload || !/[\u3400-\u9fff]/u.test(payload)) continue
    const parts = payload.split('|')
    if (parts.length < 2 || parts.some(part => !/^(?:zh-CN|zh|en)=[^=|]+$/u.test(part.trim()))) {
      errors.push(`${path.relative(root, file)}: multilingual text selector must use non-empty zh-CN/zh/en candidates: ${selector}`)
    }
  }
}

function location(file, sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  return `${path.relative(root, file)}:${line + 1}:${character + 1}`
}

function objectPropertyNames(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null
  const names = new Set()
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) return null
    if (ts.isShorthandPropertyAssignment(property)) {
      names.add(property.name.text)
    } else if (ts.isPropertyAssignment(property)) {
      const name = property.name
      if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) names.add(name.text)
      else return null
    }
  }
  return names
}

function inspectTranslationCalls(file, source) {
  if (!file.endsWith('.ts')) return
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const visit = node => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 't'
      && node.arguments.length > 0
      && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      const key = node.arguments[0].text
      const requiredParams = new Set(placeholders(dictionaries.en[key] ?? ''))
      const suppliedParams = objectPropertyNames(node.arguments[1])
      if (requiredParams.size > 0 && suppliedParams) {
        for (const param of requiredParams) {
          if (!suppliedParams.has(param)) {
            errors.push(`${location(file, sourceFile, node)}: ${key} is missing parameter {${param}}`)
          }
        }
        for (const param of suppliedParams) {
          if (!requiredParams.has(param)) {
            errors.push(`${location(file, sourceFile, node)}: ${key} supplies unused parameter {${param}}`)
          }
        }
      } else if (requiredParams.size > 0 && (!node.arguments[1] || node.arguments[1].kind === ts.SyntaxKind.UndefinedKeyword)) {
        errors.push(`${location(file, sourceFile, node)}: ${key} requires parameters [${[...requiredParams].join(', ')}]`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/gu)) referencedKeys.add(match[1])
  for (const match of source.matchAll(/\blangKey\s*:\s*['"]([^'"]+)['"]/gu)) commandKeys.add(match[1])
  inspectTranslationCalls(file, source)
  validateTextSelectors(file, source)
}
for (const key of [...referencedKeys, ...commandKeys]) {
  if (!(key in dictionaries.en)) errors.push(`source references missing key ${key}`)
}

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'))
  for (const [locale, readme] of Object.entries(manifest.readme ?? {})) {
    if (typeof readme !== 'string' || !fs.existsSync(path.join(root, readme))) {
      errors.push(`plugin.json readme.${locale} points to missing file: ${readme}`)
    }
  }
} catch (error) {
  errors.push(`cannot validate plugin.json: ${error.message}`)
}

if (errors.length) {
  console.error(`i18n validation failed (${errors.length}):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`i18n validation passed: ${baselineKeys.length} keys, ${referencedKeys.size} t() references, ${commandKeys.size} commands`)
