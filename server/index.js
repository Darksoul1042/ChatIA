import express from "express"
import cors from "cors"

const app = express()
const PORT = process.env.PORT || 8787

app.use(cors())
app.use(express.json({ limit: "1mb" }))

app.get("/health", (_req, res) => {
  res.json({ ok: true, at: new Date().toISOString() })
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
