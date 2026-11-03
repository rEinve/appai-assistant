import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import React from "react"
import { renderToString } from "react-dom/server"
import { createServer } from "vite"

const root = process.cwd()
const outputPath = path.join(root, "dist", "appai-website", "index.html")
const vite = await createServer({
  configFile: path.join(root, "vite.config.mts"),
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, ws: false },
})

try {
  const { default: App } = await vite.ssrLoadModule("/src/App.tsx")
  const markup = renderToString(React.createElement(App))
  const html = await readFile(outputPath, "utf8")
  const rootMarker = '<div id="root"></div>'

  if (!html.includes(rootMarker)) {
    throw new Error(`Expected an empty React root in ${outputPath}`)
  }

  await writeFile(outputPath, html.replace(rootMarker, `<div id="root">${markup}</div>`))
  console.log("Prerendered the APPAI landing page into dist/appai-website/index.html")
} finally {
  await vite.close()
}
