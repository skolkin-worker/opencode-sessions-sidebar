#!/usr/bin/env node

import { readFile, writeFile, mkdir, access, rm } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir, platform } from "node:os"
import { join } from "node:path"

const PLUGIN_SPEC = "opencode-sessions-sidebar"

function configDir() {
  if (platform() === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "opencode")
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "opencode")
}

async function exists(p) {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readJSONC(p) {
  const raw = await readFile(p, "utf-8")
  const stripped = raw.replace(/^\s*\/\/.*$/gm, "")
  return JSON.parse(stripped)
}

function formatJSONC(obj) {
  return JSON.stringify(obj, null, 2) + "\n"
}

function addPluginSpec(existing, spec) {
  const plugins = existing.plugins ?? []
  if (plugins.some((p) => (typeof p === "string" ? p : p.package) === spec)) {
    return false
  }
  existing.plugins = [...plugins, spec]
  return true
}

// OpenCode v2 registers CLI/TUI plugins under `plugins` in cli.json.
async function installCli(dir) {
  const cliPath = join(dir, "cli.json")
  let changed = false

  if (await exists(cliPath)) {
    const cfg = await readJSONC(cliPath)
    changed = addPluginSpec(cfg, PLUGIN_SPEC)
    if (changed) {
      await writeFile(cliPath, formatJSONC(cfg))
      console.log(`[opencode-sessions-sidebar] Added to ${cliPath}`)
    } else {
      console.log(`[opencode-sessions-sidebar] Already in ${cliPath}`)
    }
  } else {
    const cfg = {
      $schema: "https://opencode.ai/v2/cli.json",
      plugins: [PLUGIN_SPEC],
    }
    await writeFile(cliPath, formatJSONC(cfg))
    console.log(`[opencode-sessions-sidebar] Created ${cliPath}`)
    changed = true
  }
  return changed
}

// Legacy v1 installs used `plugin` in tui.jsonc — clean the entry up.
async function cleanupLegacyTuiJsonc(dir) {
  const tuiPath = join(dir, "tui.jsonc")
  if (!(await exists(tuiPath))) return

  let cfg
  try {
    cfg = await readJSONC(tuiPath)
  } catch {
    return
  }

  const plugins = cfg.plugin
  if (!Array.isArray(plugins)) return
  const remaining = plugins.filter((p) => p !== PLUGIN_SPEC)
  if (remaining.length === plugins.length) return

  if (remaining.length === 0) {
    delete cfg.plugin
  } else {
    cfg.plugin = remaining
  }

  const keys = Object.keys(cfg).filter((k) => k !== "$schema")
  if (keys.length === 0) {
    await rm(tuiPath)
    console.log(`[opencode-sessions-sidebar] Removed legacy ${tuiPath}`)
  } else {
    await writeFile(tuiPath, formatJSONC(cfg))
    console.log(`[opencode-sessions-sidebar] Cleaned legacy entry in ${tuiPath}`)
  }
}

async function main() {
  const dir = configDir()
  await mkdir(dir, { recursive: true })

  const installed = await installCli(dir)
  await cleanupLegacyTuiJsonc(dir)

  if (installed) {
    console.log("\nDone! Restart OpenCode to see the Sessions sidebar panel.")
  } else {
    console.log("\nAlready installed. Restart OpenCode if you haven't yet.")
  }
}

main().catch((err) => {
  console.error("Install failed:", err.message)
  process.exit(1)
})
