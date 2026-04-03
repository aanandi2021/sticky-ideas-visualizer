# 🎨 Sticky Ideas Visualizer

Turn a PDF of brainstorming sticky notes into an interactive, animated D3 tree visualization — clustered by theme, viewable in any browser.

![Node.js](https://img.shields.io/badge/Node.js-22%2B-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## What It Does

1. **Extracts** images from each page of a PDF
2. **Reads** the text on each sticky note (AI vision or local OCR)
3. **Lets you review** and edit the extracted ideas interactively
4. **Clusters** ideas into themes (AI-powered or keyword fallback)
5. **Generates** a self-contained HTML file with:
   - 🌳 Interactive **D3.js collapsible tree** (click to expand/collapse)
   - ▶️ **Animated playback** — branches unfold one leaf at a time with ascending chime sounds
   - 📋 **Themed detail cards** below the tree for quick reference
6. **Caches** results so re-runs are instant

## Quick Start

```bash
cd sticky-ideas-tool
npm install
node generate.js
```

You'll be prompted for:
| Prompt | Description |
|--------|-------------|
| **PDF file path** | Path to your sticky-note PDF (absolute or relative) |
| **Title** | Title shown in the visualization header |
| **Output HTML path** | Where to save the HTML (defaults to `<pdf-name>_visualization.html`) |

## AI Providers

The tool reads sticky notes and clusters ideas using AI when available, with automatic fallback to local processing.

### Priority Order

| Priority | Provider | How to Enable | What It Does |
|----------|----------|---------------|--------------|
| 1st | **OpenAI GPT-4o** | Set `OPENAI_API_KEY` | Vision reads sticky notes + AI clusters themes |
| 2nd | **Azure OpenAI** | Set `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` | Same as above, Azure-hosted |
| 3rd | **Local OCR** | No setup needed | Tesseract.js reads text locally (slower, free) |

### OpenAI Setup

```bash
# Windows
set OPENAI_API_KEY=sk-your-key-here
node generate.js

# macOS/Linux
export OPENAI_API_KEY=sk-your-key-here
node generate.js
```

### Azure OpenAI Setup

```bash
set AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
set AZURE_OPENAI_KEY=your-key
set AZURE_OPENAI_DEPLOYMENT=gpt-4o          # optional, defaults to gpt-4o
set AZURE_OPENAI_API_VERSION=2024-08-01-preview  # optional
node generate.js
```

### No API Key? No Problem

Without any API keys, the tool uses **Tesseract.js** (bundled, no install needed) for OCR and **keyword-based clustering**. It's slower (~2–3 min for 40 pages) and less precise, but fully functional offline.

## Interactive Review

After reading the sticky notes, you'll see all extracted ideas and can:

| Key | Action |
|-----|--------|
| `Enter` | Accept all ideas as-is |
| `e <#>` | Edit an idea's title or description |
| `d <#>` | Delete an idea |
| `a` | Add a new idea manually |
| `r` | Reprint the full list |

## Caching

Results are saved to `<pdf-name>.ideas.json` alongside the PDF. On re-run, the tool detects the cache and asks if you want to reuse it — skipping extraction entirely for instant visualization regeneration.

## Output

The generated HTML file is **fully self-contained** (loads D3.js from CDN) and includes:

- **Collapsible tree** — click any theme node to expand/collapse its ideas
- **▶ Play Animation** — watches the tree grow branch by branch with soothing chime sounds
- **Expand All / Collapse All / Reset** buttons
- **Hover tooltips** on idea nodes showing descriptions
- **Themed detail cards** with full idea descriptions below the tree

## Project Structure

```
sticky-ideas-tool/
├── generate.js       # Main CLI pipeline
├── template.html     # D3 tree HTML template
├── package.json
└── node_modules/
```

## Requirements

- **Node.js 22+** (uses built-in `fetch`)
- **Internet connection** for D3.js CDN in the output HTML (and for AI providers if used)

## Tips for Live Demos

- **Pre-run once** to populate the cache, then re-run for instant results
- **Set your API key** beforehand so the demo flows smoothly
- **Turn up your volume** — the animation has ascending chime sounds 🔔
- If the AI provider is down, the local fallback kicks in automatically
