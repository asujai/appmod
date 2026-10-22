// Android recipes over ADB. Without root, an installed app's UI cannot be injected into, so the
// supported change is the official per-app language (Android 13+, LocaleManager): it works when
// the app ships the language or falls back sensibly. Analysis of the APK goes through REA.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { mkdirSync, existsSync, readdirSync } from 'node:fs'

export function adb(recipe, args, { allowFail = false } = {}) {
  const { adb: bin, device } = recipe.app
  try {
    return execFileSync(bin, [...(device ? ['-s', device] : []), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (allowFail) return null
    const msg = (error.stderr || error.message || '').toString().trim()
    throw new Error(`adb ${args.join(' ')} failed: ${msg || error.message}`)
  }
}

export function androidInfo(recipe) {
  const pkg = recipe.app.package
  const sdk = Number(adb(recipe, ['shell', 'getprop', 'ro.build.version.sdk']))
  const model = adb(recipe, ['shell', 'getprop', 'ro.product.model'])
  const dump = adb(recipe, ['shell', 'dumpsys', 'package', pkg], { allowFail: true }) || ''
  const version = /versionName=(\S+)/.exec(dump)?.[1] || null
  if (!version && !/Package \[/.test(dump)) throw new Error(`package ${pkg} is not installed on ${model}`)
  const locales = sdk >= 33 ? adb(recipe, ['shell', 'cmd', 'locale', 'get-app-locales', pkg], { allowFail: true }) : null
  return { model, sdk, package: pkg, version, appLocales: locales, perAppLanguage: sdk >= 33 }
}

export function applyAppLocale(recipe) {
  const info = androidInfo(recipe)
  if (!info.perAppLanguage) throw new Error(`per-app language needs Android 13 (API 33); ${info.model} has API ${info.sdk}`)
  const code = recipe.language?.code
  if (!code) throw new Error('recipe has no language.code')
  adb(recipe, ['shell', 'cmd', 'locale', 'set-app-locales', recipe.app.package, '--locales', code])
  return { ...info, appLocales: adb(recipe, ['shell', 'cmd', 'locale', 'get-app-locales', recipe.app.package], { allowFail: true }) }
}

// Omitting --locales clears the per-app setting, so the app follows the system language again.
export function resetAppLocale(recipe) {
  adb(recipe, ['shell', 'cmd', 'locale', 'set-app-locales', recipe.app.package])
  return adb(recipe, ['shell', 'cmd', 'locale', 'get-app-locales', recipe.app.package], { allowFail: true })
}

export function startApp(recipe) {
  return adb(recipe, ['shell', 'monkey', '-p', recipe.app.package, '-c', 'android.intent.category.LAUNCHER', '1'])
}

// Copies the installed base APK into the recipe's analysis folder (read-only copy for REA).
export function pullApk(recipe) {
  const paths = adb(recipe, ['shell', 'pm', 'path', recipe.app.package]).split(/\r?\n/).map(l => l.replace(/^package:/, '').trim())
  const base = paths.find(p => p.endsWith('/base.apk')) || paths[0]
  if (!base) throw new Error('package path not found')
  mkdirSync(recipe.analysisDir, { recursive: true })
  const out = join(recipe.analysisDir, `${recipe.app.package}.apk`)
  adb(recipe, ['pull', base, out])
  return { out, splits: paths.length - 1 }
}

// aapt2 from the Android SDK lists the resource configurations, i.e. the languages an APK ships.
export function findAapt2() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || join(process.env.HOME || '', 'Library'), 'Android', 'Sdk')
  const tools = join(sdk, 'build-tools')
  if (!existsSync(tools)) return null
  const versions = readdirSync(tools).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  for (const v of versions) {
    for (const name of ['aapt2.exe', 'aapt2']) if (existsSync(join(tools, v, name))) return join(tools, v, name)
  }
  return null
}

export function apkLocales(apk) {
  const aapt2 = findAapt2()
  if (!aapt2) return null
  return parseConfigurations(execFileSync(aapt2, ['dump', 'configurations', apk], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
}

export function parseConfigurations(out) {
  const codes = new Set()
  for (const line of out.split(/\r?\n/)) {
    // e.g. "tr", "pt-rBR", "b+sr+Latn", "tr-v21", "zh-rTW-land"
    const m = /^(?:b\+)?([a-z]{2,3})(?:[-+]r?([A-Z]{2}|[A-Za-z]{4}))?(?:[-+]|$)/.exec(line.trim())
    if (m) codes.add(m[2] ? `${m[1]}-${m[2]}` : m[1])
  }
  return Array.from(codes).sort()
}
