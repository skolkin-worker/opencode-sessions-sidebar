const definition = {
  id: "opencode-sessions-sidebar",
  async setup() {
    // Server side is intentionally empty: this package is a TUI-only plugin.
    // A valid V2 server definition is exported so the package can also be
    // registered through `plugins` in opencode.json without load errors.
  },
}

export default definition
