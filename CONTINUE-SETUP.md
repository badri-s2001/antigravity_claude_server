# Continue Extension Setup Guide

This guide shows how to use the Antigravity Claude Proxy with the [Continue](https://continue.dev) VS Code extension.

## Why Continue?

- Works with **any VS Code version** (not just Insiders)
- Supports custom OpenAI-compatible endpoints out-of-the-box
- Free and open source
- Provides chat, code editing, and inline suggestions

## Prerequisites

1. The proxy server is installed and running:
   ```bash
   cd antigravity-claude-proxy
   npm install
   npm start
   ```

2. At least one Google account is configured (see main README)

## Installation

### Step 1: Install Continue Extension

In VS Code:
1. Press `Ctrl+Shift+X` to open Extensions
2. Search for **"Continue"**
3. Click **Install** on "Continue - Codestral, Claude, and more"

Or via command line:
```bash
code --install-extension continue.continue
```

### Step 2: Open Continue Config

1. Press `Ctrl+Shift+P`
2. Type **"Continue: Open Config"**
3. Press Enter

This opens `~/.continue/config.yaml`

### Step 3: Add Proxy Models

Add the following models to your `config.yaml`:

```yaml
name: My Config
version: 1.0.0
schema: v1
models:
  # Claude Opus with Thinking (via Antigravity)
  - name: Opus-Proxy (Antigravity)
    provider: openai
    model: opus-proxy
    apiBase: http://localhost:8080/v1
    apiKey: test
    roles:
      - chat
      - edit
      - apply

  # Claude Sonnet with Thinking (via Antigravity)
  - name: Sonnet-Proxy (Antigravity)
    provider: openai
    model: sonnet-proxy
    apiBase: http://localhost:8080/v1
    apiKey: test
    roles:
      - chat
      - edit
      - apply

  # Gemini Flash (via Antigravity)
  - name: Gemini-Flash-Proxy
    provider: openai
    model: gemini-proxy
    apiBase: http://localhost:8080/v1
    apiKey: test
    roles:
      - chat
      - edit
      - apply
```

### Step 4: Save and Use

1. Save the config file
2. Click the **Continue icon** in the sidebar (or press `Ctrl+L`)
3. Click the **model dropdown** at the bottom
4. Select **"Opus-Proxy (Antigravity)"**
5. Start chatting!

## Available Model Aliases

The proxy automatically maps these model names:

| Model Name | Maps To |
|------------|---------|
| `opus-proxy` | `claude-opus-4-5-thinking` |
| `sonnet-proxy` | `claude-sonnet-4-5-thinking` |
| `gemini-proxy` | `gemini-3-flash` |
| `opus`, `claude-opus` | `claude-opus-4-5-thinking` |
| `sonnet`, `claude-sonnet` | `claude-sonnet-4-5-thinking` |
| `flash`, `gemini` | `gemini-3-flash` |

## Troubleshooting

### Model not appearing in dropdown

- Reload VS Code window: `Ctrl+Shift+P` → "Reload Window"
- Check that the config file is valid YAML

### Connection errors

- Ensure the proxy is running: `npm start`
- Check that port 8080 is not blocked

### Authentication errors

- Run `npm run accounts:verify` to check account status
- Add a new account with `npm run accounts:add`

## Tips

- Use `Ctrl+L` to quickly open Continue chat
- Use `Ctrl+I` for inline code generation
- Highlight code and press `Ctrl+L` to ask questions about it
