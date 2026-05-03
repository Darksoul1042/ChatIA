import { useState, useRef, useEffect, useCallback } from "react"

const SYSTEM_PROMPTS = {
  chat:     "Eres Nova, una IA avanzada. Responde de forma clara y concisa. Usa markdown apropiadamente. Los párrafos son compactos.",
  code:     "Eres Nova, Senior Lead Developer al nivel de GitHub Copilot. Generas código limpio, eficiente y bien comentado. Siempre incluyes comandos de instalación y cómo ejecutar. Para ejecutables Python incluyes PyInstaller con sys._MEIPASS. Usas bloques de código con el lenguaje especificado.",
  fast:     "Eres Nova. Responde de forma MUY breve y directa. Máximo 3-4 oraciones. Sin listas innecesarias.",
  balanced: "Eres Nova. Responde de forma equilibrada: suficientemente detallada para ser útil, sin extenderte.",
  deep:     "Eres Nova en modo investigador. Responde de forma exhaustiva. Usa secciones, listas y ejemplos. Analiza múltiples perspectivas.",
}

const STYLES = {
  normal:      { label:"Normal",      prompt:"" },
  aprendizaje: { label:"Aprendizaje", prompt:" Usa analogías y ejemplos simples." },
  conciso:     { label:"Conciso",     prompt:" Sé muy breve. Solo lo esencial." },
  explicativo: { label:"Explicativo", prompt:" Explica cada concepto en detalle, paso a paso." },
  formal:      { label:"Formal",      prompt:" Usa un tono profesional y formal." },
}

function renderMd(t) {
  return t
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_,l,c) => {
      const lang = l||"code"
      const esc = c.trim().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      return `<div class="cb"><div class="cb-h"><span class="cb-l">${lang}</span><button class="cb-cp" onclick="navigator.clipboard.writeText(this.closest('.cb').querySelector('code').textContent)">Copiar</button></div><pre><code>${esc}</code></pre></div>`
    })
    .replace(/`([^`]+)`/g,'<code class="ic">$1</code>')
    .replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.*?)\*/g,"<em>$1</em>")
    .replace(/^### (.+)/gm,"<h3>$1</h3>")
    .replace(/^## (.+)/gm,"<h2>$1</h2>")
    .replace(/^# (.+)/gm,"<h1>$1</h1>")
    .replace(/^[-*] (.+)/gm,"<li>$1</li>")
    .replace(/(<li>.*?<\/li>(\n|$))+/g, s=>`<ul>${s}</ul>`)
    .replace(/\n{2,}/g,"<br/>")
    .replace(/\n/g,"<br/>")
}

function buildFallbackResponse(userText, mode, style) {
  const contextLine = mode === "code"
    ? "Puedo ayudarte con código, arquitectura, debugging o automatización."
    : "Puedo ayudarte con explicaciones, redacción, ideas, análisis o investigación."

  const styleLine = style !== "normal" ? `Responderé con estilo **${STYLES[style]?.label || style}**.` : ""

  return `Entiendo tu mensaje: **"${userText.slice(0, 160)}${userText.length > 160 ? "..." : ""}"**.\n\n${contextLine} ${styleLine}\n\nSi quieres, dime el objetivo exacto y te doy una respuesta más precisa en el siguiente mensaje.`
}

export default function App() {
  const [chats, setChats] = useState([{id:"1",title:"Nueva conversación",msgs:[]}])
  const [activeChat, setActive] = useState("1")
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState("")
  const [mode, setMode] = useState("chat")
  const [style, setStyle] = useState("normal")
  const [webSearch, setWebSearch] = useState(true)
  const [errorMsg, setErrorMsg] = useState("")
  const bottomRef = useRef(null)
  const abortRef = useRef(null)

  const chat = chats.find(c=>c.id===activeChat)
  const msgs = chat?.msgs || []

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}) },[msgs,streaming])

  const send = useCallback(async () => {
    const text = input.trim()
    if(!text||loading) return

    setInput("")
    const userMsg = {role:"user",content:text}
    const newMsgs = [...msgs, userMsg]
    setChats(p=>p.map(c=>c.id===activeChat
      ?{...c,msgs:newMsgs,title:c.msgs.length===0?text.slice(0,40):c.title}:c))
    setLoading(true); setStreaming(""); setErrorMsg("")

    const modeKey = mode === "chat" ? "chat" : mode
    const system = (SYSTEM_PROMPTS[modeKey]||SYSTEM_PROMPTS.chat) + (STYLES[style]?.prompt||"")
    const tools = webSearch ? [{type:"web_search_20250305",name:"web_search"}] : []

    try {
      const ctrl = new AbortController()
      abortRef.current = ctrl

      const res = await fetch("http://localhost:8787/api/chat", {
        method:"POST",
        signal:ctrl.signal,
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:4096,
          system,
          ...(tools.length?{tools}:{}),
          messages:newMsgs.map(m=>({role:m.role,content:m.content}))
        })
      })

      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`)

      const reply = (payload?.text || "").trim() || buildFallbackResponse(text, mode, style)
      setChats(p=>p.map(c=>c.id===activeChat
        ?{...c,msgs:[...newMsgs,{role:"assistant",content:reply}]}:c))
      setStreaming("")
    } catch (e) {
      if(e.name!=="AbortError") {
        setErrorMsg(`La API no respondió (${e?.message || "error desconocido"}). Se usó respuesta de respaldo local.`)
        const fallback = buildFallbackResponse(text, mode, style)
        setChats(p=>p.map(c=>c.id===activeChat
          ?{...c,msgs:[...newMsgs,{role:"assistant",content:fallback}]}:c))
      }
      setStreaming("")
    }

    setLoading(false)
  }, [input, loading, msgs, activeChat, mode, style, webSearch])

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{maxWidth:900, margin:"0 auto", padding:20, fontFamily:"sans-serif"}}>
      <h2>Nova IA</h2>
      <div style={{border:"1px solid #ddd", borderRadius:12, padding:16, minHeight:420}}>
        {msgs.map((m, i) => (
          <div key={i} style={{display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", marginBottom:14}}>
            <div style={{maxWidth:"75%", borderRadius:14, padding:"10px 12px", background:m.role==="user"?"#e9e2ff":"#f3f4f6", border:"1px solid #ddd"}}>
              <div style={{fontSize:12, fontWeight:700, marginBottom:4, color:m.role==="user"?"#5b35e3":"#555"}}>{m.role==="user"?"Tú":"Nova"}</div>
              {m.role==="assistant" ? <div dangerouslySetInnerHTML={{__html:renderMd(m.content)}}/> : <div>{m.content}</div>}
            </div>
          </div>
        ))}
        {streaming && (
          <div style={{display:"flex", justifyContent:"flex-start", marginBottom:14}}>
            <div style={{maxWidth:"75%", borderRadius:14, padding:"10px 12px", background:"#f3f4f6", border:"1px solid #ddd"}}>
              <div style={{fontSize:12, fontWeight:700, marginBottom:4, color:"#555"}}>Nova</div>
              <div dangerouslySetInnerHTML={{__html:renderMd(streaming)}}/>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{display:"flex", gap:8, marginTop:12}}>
        <select value={mode} onChange={e=>setMode(e.target.value)}>
          <option value="chat">Chat</option><option value="code">Code</option><option value="fast">Fast</option><option value="balanced">Balanced</option><option value="deep">Deep</option>
        </select>
        <select value={style} onChange={e=>setStyle(e.target.value)}>
          {Object.entries(STYLES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label><input type="checkbox" checked={webSearch} onChange={e=>setWebSearch(e.target.checked)} /> Web</label>
      </div>
      {errorMsg && <div style={{marginTop:10, color:"#b45309", fontSize:12}}>{errorMsg}</div>}
      <div style={{display:"flex", gap:8, marginTop:8}}>
        <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="Escribe aquí..." rows={3} style={{flex:1}} />
        {loading ? <button onClick={()=>abortRef.current?.abort()}>Stop</button> : <button onClick={send}>Enviar</button>}
      </div>
    </div>
  )
}
