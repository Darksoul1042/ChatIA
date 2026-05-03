import express from "express"
import cors from "cors"

const app = express()
const PORT = process.env.PORT || 8787

app.use(cors())
app.use(express.json({ limit: "1mb" }))

const rateMap = new Map()
function checkRateLimit(ip, limit = 60, windowMs = 60_000) {
  const now = Date.now()
  const item = rateMap.get(ip) || { count: 0, resetAt: now + windowMs }
  if (now > item.resetAt) {
    item.count = 0
    item.resetAt = now + windowMs
  }
  item.count += 1
  rateMap.set(ip, item)
  return { ok: item.count <= limit, remaining: Math.max(0, limit - item.count), resetAt: item.resetAt }
}

app.use((req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown"
  const rl = checkRateLimit(ip)
  res.setHeader("X-RateLimit-Remaining", String(rl.remaining))
  if (!rl.ok) return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." })
  next()
})

app.get("/health", (_req, res) => {
  res.json({ ok: true, at: new Date().toISOString() })
})

app.post("/api/image", async (req, res) => {
  try {
    const { prompt = "", width = 1024, height = 1024 } = req.body || {}
    if (!prompt.trim()) return res.status(400).json({ error: "Prompt requerido" })
    const seed = Math.floor(Math.random() * 1000000)
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`
    return res.json({ imageUrl, seed })
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Image error" })
  }
})


app.post("/api/chat/stream", async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" })
    const { messages = [], system = "", max_tokens = 2048, model = "claude-sonnet-4-20250514" } = req.body || {}

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model, max_tokens, system, messages, stream: true })
    })

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => "")
      return res.status(upstream.status).json({ error: t || "Upstream stream error" })
    }

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === "[DONE]") continue
        try {
          const ev = JSON.parse(raw)
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            res.write(`data: ${JSON.stringify({ token: ev.delta.text })}\n\n`)
          }
        } catch {}
      }
    }
    res.write('data: {"done":true}\n\n')
    res.end()
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err?.message || "stream error" })
  }
})

app.post("/api/chat", async (req, res) => {
  try {
    const { provider = "anthropic", messages = [], system = "", max_tokens = 2048, model } = req.body || {}

    if (provider === "groq") {
      const groqKey = process.env.GROQ_API_KEY
      if (!groqKey) return res.status(500).json({ error: "Missing GROQ_API_KEY" })
      const groqModel = model || "llama-3.3-70b-versatile"
      const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${groqKey}`
        },
        body: JSON.stringify({ model: groqModel, messages: [{ role: "system", content: system }, ...messages] })
      })
      const data = await upstream.json().catch(() => ({}))
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.error?.message || "Groq error", raw: data })
      const text = data?.choices?.[0]?.message?.content || ""
      return res.json({ text, provider: "groq", raw: data })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" })

    const selectedModel = model || "claude-sonnet-4-20250514"

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: selectedModel, max_tokens, system, messages })
    })

    const data = await upstream.json().catch(() => ({}))
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.error?.message || "Anthropic error", raw: data })
    }

    const text = Array.isArray(data?.content)
      ? data.content.filter(c => c?.type === "text").map(c => c.text).join("\n")
      : ""

    return res.json({ text, provider: "anthropic", raw: data })
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Server error" })
  }
})

app.listen(PORT, () => {
  console.log(`Nova backend running on http://localhost:${PORT}`)
})
