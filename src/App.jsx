import { useState, useRef, useEffect, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"

const SYSTEM_PROMPTS = {
  chat: "Eres Nova, una IA avanzada. Responde de forma clara y concisa. Usa markdown apropiadamente.",
  code: "Eres Nova, Arquitecto de Software Senior. Entrega código limpio y ejecutable. En proyectos grandes, empieza por arquitectura y estructura de carpetas.",
  fast: "Eres Nova. Responde de forma MUY breve y directa. Máximo 3-4 oraciones.",
  balanced: "Eres Nova. Responde de forma equilibrada: suficientemente detallada para ser útil.",
  deep: "Eres Nova en modo investigador. Responde exhaustivamente. Usa secciones y ejemplos.",
  image: "Eres Nova en modo generador visual. Crea prompts claros para generación de imágenes."
}

const STYLES = {
  normal: { label: "Normal", prompt: "" },
  aprendizaje: { label: "Aprendizaje", prompt: " Usa analogías y ejemplos simples." },
  conciso: { label: "Conciso", prompt: " Sé muy breve. Solo lo esencial." },
  formal: { label: "Formal", prompt: " Usa tono profesional y formal." }
}

function buildFallbackResponse(userText, mode, style) {
  const contextLine = mode === "code"
    ? "Puedo ayudarte con arquitectura, debugging, scripts y desarrollo full-stack."
    : "Puedo ayudarte con redacción, análisis, ideas y explicaciones claras."
  const styleLine = style !== "normal" ? `Aplicaré estilo **${STYLES[style]?.label || style}**.` : ""
  return `Entiendo tu mensaje: **\"${userText.slice(0, 160)}${userText.length > 160 ? "..." : ""}\"**.\n\n${contextLine} ${styleLine}\n\nSi quieres, te respondo ahora mismo con un enfoque más específico.`
}

const MarkdownComponents = {
  code({ inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "")
    const codeString = String(children).replace(/\n$/, "")
    if (!inline && match) {
      return (
        <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ borderRadius: 10, padding: 14 }} {...props}>
          {codeString}
        </SyntaxHighlighter>
      )
    }
    return <code style={{ background: "#f0ede6", padding: "2px 6px", borderRadius: 4 }} {...props}>{children}</code>
  }
}

export default function App() {
  const [chats, setChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nova-chats")) || [{ id: "1", title: "Nueva conversación", msgs: [] }] }
    catch { return [{ id: "1", title: "Nueva conversación", msgs: [] }] }
  })
  const [activeChat, setActive] = useState("1")
  const [searchTerm, setSearchTerm] = useState("")
  const [provider, setProvider] = useState(() => localStorage.getItem("nova-provider") || "anthropic")
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState("chat")
  const [style, setStyle] = useState("normal")
  const [webSearch, setWebSearch] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")
  const bottomRef = useRef(null)
  const abortRef = useRef(null)

  const chat = chats.find(c => c.id === activeChat) || chats[0]
  const msgs = chat?.msgs || []
  const filteredChats = chats.filter(c => c.title.toLowerCase().includes(searchTerm.toLowerCase()))

  useEffect(() => { localStorage.setItem("nova-chats", JSON.stringify(chats)) }, [chats])
  useEffect(() => { localStorage.setItem("nova-provider", provider) }, [provider])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs])

  const newChat = () => {
    const id = Date.now().toString()
    setChats(p => [{ id, title: "Nueva conversación", msgs: [] }, ...p])
    setActive(id)
  }

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput("")
    const userMsg = { role: "user", content: text }
    const newMsgs = [...msgs, userMsg]
    setChats(p => p.map(c => c.id === activeChat ? { ...c, msgs: newMsgs, title: c.msgs.length === 0 ? text.slice(0, 40) : c.title } : c))
    setLoading(true); setErrorMsg("")

    const system = (SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.chat) + (STYLES[style]?.prompt || "")
    try {
      const ctrl = new AbortController(); abortRef.current = ctrl

      if (mode === "image") {
        const imgRes = await fetch("http://localhost:8787/api/image", {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, width: 1024, height: 1024 })
        })
        const imgPayload = await imgRes.json().catch(() => ({}))
        if (!imgRes.ok) throw new Error(imgPayload?.error || `HTTP ${imgRes.status}`)
        const imageMd = `![${text}](${imgPayload.imageUrl})

Semilla: ${imgPayload.seed}`
        setChats(p => p.map(c => c.id === activeChat ? { ...c, msgs: [...newMsgs, { role: "assistant", content: imageMd }] } : c))
        setLoading(false)
        return
      }

      let reply = ""
      if (provider === "anthropic") {
        const res = await fetch("http://localhost:8787/api/chat/stream", {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: webSearch ? `${system} Puedes usar contexto actualizado si está disponible.` : system,
            messages: newMsgs.map(m => ({ role: m.role, content: m.content }))
          })
        })
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        const reader = res.body.getReader(); const dec = new TextDecoder(); let full = ""
        while (true) {
          const { done, value } = await reader.read(); if (done) break
          for (const line of dec.decode(value).split("
")) {
            if (!line.startsWith("data:")) continue
            const raw = line.slice(5).trim(); if (!raw) continue
            try { const ev = JSON.parse(raw); if (ev.token) { full += ev.token; setChats(p => p.map(c => c.id === activeChat ? { ...c, msgs: [...newMsgs, { role: "assistant", content: full }] } : c)) } } catch {}
          }
        }
        reply = full
      } else {
        const res = await fetch("http://localhost:8787/api/chat", {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            model: "llama-3.3-70b-versatile",
            max_tokens: 4096,
            system: webSearch ? `${system} Puedes usar contexto actualizado si está disponible.` : system,
            messages: newMsgs.map(m => ({ role: m.role, content: m.content }))
          })
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`)
        reply = payload?.text || ""
      }
      reply = reply.trim() || buildFallbackResponse(text, mode, style)
      setChats(p => p.map(c => c.id === activeChat ? { ...c, msgs: [...newMsgs, { role: "assistant", content: reply }] } : c))
    } catch (e) {
      if (e.name !== "AbortError") {
        setErrorMsg(`La API no respondió (${e?.message || "error"}). Usé fallback local.`)
        setChats(p => p.map(c => c.id === activeChat ? { ...c, msgs: [...newMsgs, { role: "assistant", content: buildFallbackResponse(text, mode, style) }] } : c))
      }
    }
    setLoading(false)
  }, [input, loading, msgs, activeChat, mode, style, webSearch, provider])

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      <aside style={{ width: 260, borderRight: "1px solid #ddd", padding: 10 }}>
        <button onClick={newChat}>+ Nuevo chat</button>
        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar..." style={{ width: "100%", marginTop: 8 }} />
        <div style={{ marginTop: 10 }}>
          {filteredChats.map(c => <button key={c.id} onClick={() => setActive(c.id)} style={{ display: "block", width: "100%", textAlign: "left" }}>{c.title}</button>)}
        </div>
      </aside>
      <main style={{ flex: 1, padding: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, minHeight: 420 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 14 }}>
              <div style={{ maxWidth: "75%", borderRadius: 14, padding: "10px 12px", background: m.role === "user" ? "#e9e2ff" : "#f3f4f6", border: "1px solid #ddd" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{m.role === "user" ? "Tú" : "Nova"}</div>
                {m.role === "assistant"
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{m.content}</ReactMarkdown>
                  : <div>{m.content}</div>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <select value={mode} onChange={e => setMode(e.target.value)}><option value="chat">Chat</option><option value="code">Code</option><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="deep">Deep</option><option value="image">Imagen</option></select>
          <select value={style} onChange={e => setStyle(e.target.value)}>{Object.entries(STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select value={provider} onChange={e => setProvider(e.target.value)}><option value="anthropic">Anthropic</option><option value="groq">Groq</option></select>
          <label><input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} /> Web</label>
        </div>
        {errorMsg && <div style={{ marginTop: 10, color: "#b45309", fontSize: 12 }}>{errorMsg}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }} rows={3} style={{ flex: 1 }} />
          {loading ? <button onClick={() => abortRef.current?.abort()}>Stop</button> : <button onClick={send}>Enviar</button>}
        </div>
      </main>
    </div>
  )
}
