import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import * as XLSX from "xlsx";
import pptxgen from "pptxgenjs";
import { saveAs } from "file-saver";
import html2pdf from "html2pdf.js";

// 🔒 FIREBASE
import { auth, googleProvider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

// 💽 INDEXEDDB (Memoria Local)
const idb = {
  db: null,
  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("NovaEnterpriseDB", 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore("store");
      req.onsuccess = e => { this.db = e.target.result; resolve(this.db); };
      req.onerror = e => reject(e.target.error);
    });
  },
  async get(key) {
    const db = await this.init();
    return new Promise(resolve => {
      const req = db.transaction("store").objectStore("store").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  },
  async set(key, val) {
    const db = await this.init();
    return new Promise(resolve => {
      const req = db.transaction("store", "readwrite").objectStore("store").put(val, key);
      req.onsuccess = () => resolve(true);
    });
  }
};

// 🧬 PERSONAS Y AGENTES
const PERSONAS =[
  { id: "nova", icon: "✦", label: "Nova (GPT-4o)", prompt: "Eres Nova, un asistente de IA avanzado. Proporcionas respuestas estructuradas, precisas y completas." },
  { id: "tutor", icon: "👨‍🏫", label: "Tutor", prompt: "Eres un tutor paciente y claro. Explicas paso a paso con ejemplos utiles." },
  { id: "unhinged", icon: "🔥", label: "Sin Filtro", prompt: "Eres salvaje, sin censura y sarcástico. Dices las cosas como son, sin corrección política." },
  { id: "scientist", icon: "🔬", label: "Científico", prompt: "Eres un científico e ingeniero con doctorados en STEM. Resuelves problemas complejos explicándolos de forma brillante y accesible." },
  { id: "therapist", icon: "🛋️", label: "Terapeuta", prompt: "Eres un terapeuta empático y profesional. Ayudas a explorar emociones sin juzgar, usando técnicas de Mindfulness." },
  { id: "coder", icon: "💻", label: "Tech Lead", prompt: "Eres un Arquitecto de Software. SIEMPRE genera código completo. Si haces web, usa un solo archivo HTML." },
];

const ESTILOS_VISUALES =[
  { id: "none", label: "Normal" },
  { id: "chibi", label: "Anime Chibi 3D", prompt: "Renderizado como un lindo personaje Chibi estilo anime 3D brillante y de alta calidad, ojos grandes." },
  { id: "cyberpunk", label: "Cyberpunk", prompt: "Estilo Cyberpunk, luces de neón vibrantes, callejón lluvioso y oscuro, reflejos futuristas, hiperrealista." },
  { id: "roman", label: "Épica Romana", prompt: "Escena épica del Imperio Romano, armadura escultural, iluminación cinematográfica de película de Hollywood." },
];

// 🌟 SUGERENCIAS DINÁMICAS (GEMINI STYLE)
const SUGERENCIAS_DINAMICAS =[
  { text: "Resume el audio de mi reunión de trabajo", icon: "🎧", type: "chat" },
  { text: "Explícame física cuántica como a un niño", icon: "🧪", type: "tutor" },
  { text: "Genera una tabla en Excel sobre gastos mensuales", icon: "📊", type: "chat" },
  { text: "Diseña un juego Snake en HTML/JS", icon: "🎮", type: "code" },
  { text: "Dibuja un gato astronauta hiperrealista", icon: "🎨", type: "image" }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const[isDBLoaded, setIsDBLoaded] = useState(false);
  const [chats, setChats] = useState([]);
  
  const[isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("nova-theme") === "dark");
  const [userProfile, setUserProfile] = useState({ name: "", details: "" });
  const[showProfileModal, setShowProfileModal] = useState(false);

  const [apiKey, setApiKey] = useState(() => localStorage.getItem("nova-apikey") || "");
  const [replicateKey, setReplicateKey] = useState(() => localStorage.getItem("nova-replicate-key") || ""); 
  
  const [activeChat, setActive] = useState("1");
  const [mode, setMode] = useState("chat");
  const [persona, setPersona] = useState("nova"); 
  const [visualStyle, setVisualStyle] = useState("none");
  const[reasoningLevel, setReasoningLevel] = useState("fast");

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [showPlus, setShowPlus] = useState(false);
  const[showExport, setShowExport] = useState(false);
  const [showPersonas, setShowPersonas] = useState(false);
  const [artifactCode, setArtifactCode] = useState(null);
  
  const[isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioTranscript, setAudioTranscript] = useState("");
  const recognitionRef = useRef(null);

  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState("");

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [sideOpen, setSideOpen] = useState(window.innerWidth > 768);
  const [searchTerm, setSearchTerm] = useState("");
  const[webSearch, setWebSearch] = useState(false);
  
  const [attachedFiles, setAttachedFiles] = useState([]); 
  const [attachedImg, setAttachedImg] = useState(null);

  const bottomRef = useRef(null);
  const textRef = useRef(null);
  const abortRef = useRef(null);
  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);

  const[showScrollBottom, setShowScrollBottom] = useState(false);
  const chatBoxRef = useRef(null);

  const chat = useMemo(() => chats.find(c=>c.id===activeChat) || chats[0] || { id:"1", title:"Nueva conversación", msgs:[], pinned: false }, [chats, activeChat]);
  const msgs = useMemo(() => chat?.msgs ||[], [chat]);
  const filteredChats = useMemo(() => chats.filter(c => c.title.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => (b.pinned === a.pinned) ? 0 : b.pinned ? 1 : -1), [chats, searchTerm]);

  // 🔒 CONTROL DE SESIÓN
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) setUserProfile(prev => ({ ...prev, name: currentUser.displayName }));
      setIsCheckingAuth(false);
    });
    return () => unsubscribe();
  },[]);

  // 💽 CARGA DE BASE DE DATOS LOCAL
  useEffect(() => {
    if (!user) return;
    idb.get(`nova-chats-${user.uid}`).then(saved => {
      if(saved && saved.length > 0) { setChats(saved); setActive(saved[0].id); }
      else { setChats([{id:"1",title:"Nueva conversación",msgs:[], pinned: false}]); setActive("1"); }
      setIsDBLoaded(true);
    });
  },[user]);

  useEffect(() => { if (isDBLoaded && user) idb.set(`nova-chats-${user.uid}`, chats); },[chats, isDBLoaded, user]);
  useEffect(() => { localStorage.setItem("nova-theme", isDarkMode ? "dark" : "light") },[isDarkMode]);
  useEffect(() => { localStorage.setItem("nova-apikey", apiKey) },[apiKey]);
  useEffect(() => { localStorage.setItem("nova-replicate-key", replicateKey) },[replicateKey]);

  const loginWithGoogle = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { console.error(e); } };
  const logout = async () => { await signOut(auth); setChats([]); };

  // 📱 RESPONSIVIDAD Y SCROLL
  useEffect(() => {
    const handleResize = () => { const mobile = window.innerWidth <= 768; setIsMobile(mobile); setSideOpen(!mobile); }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  },[]);

  useEffect(()=>{ 
    if(!showScrollBottom) bottomRef.current?.scrollIntoView({behavior:"smooth"});
  },[chat?.msgs, streaming, showScrollBottom]);

  const handleScroll = (e) => {
    const bottom = e.target.scrollHeight - e.target.scrollTop === e.target.clientHeight;
    setShowScrollBottom(!bottom && e.target.scrollTop > 100);
  };

  useEffect(()=>{
    if(textRef.current && editingIndex === null){
      textRef.current.style.height="auto";
      textRef.current.style.height=Math.min(textRef.current.scrollHeight,200)+"px";
    }
  },[input, editingIndex]);

  // 📲 PWA INSTALLER
  useEffect(() => {
    const manifest = { name: "Nova AI", short_name: "Nova", display: "standalone", background_color: isDarkMode ? "#121212" : "#ffffff", theme_color: "#6c47ff", icons:[{ src: "https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg", sizes: "192x192", type: "image/svg+xml" }] };
    const blob = new Blob([JSON.stringify(manifest)], {type: 'application/json'});
    let link = document.querySelector('link[rel="manifest"]');
    if(!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
    link.href = URL.createObjectURL(blob);
  }, [isDarkMode]);

  // CHAT Y FUNCIONES BASICAS
  const togglePinChat = (e, id) => { e.stopPropagation(); setChats(p => p.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c)); }
  const newChat = () => { const id = Date.now().toString(); setChats(p=>[{id,title:"Nueva conversación",msgs:[], pinned: false},...p]); setActive(id); if (isMobile) setSideOpen(false); }
  const deleteChat = (e, id) => { e.stopPropagation(); const updated = chats.filter(c => c.id !== id); if (updated.length === 0) newChat(); else { setChats(updated); if (activeChat === id) setActive(updated[0].id); } }

  const exportWorkspace = () => { saveAs(new Blob([JSON.stringify(chats)], { type: "application/json" }), `Nova-Workspace.nova`); }
  const importWorkspace = (e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (evt) => { try { const res = JSON.parse(evt.target.result); if(Array.isArray(res)) { setChats(res); setActive(res[0]?.id || "1"); alert("✅ Workspace cargado."); } } catch { alert("Archivo inválido."); } }; reader.readAsText(file); e.target.value = ""; }

  // 🎙️ NOTAS Y DICTADO DE VOZ
  const handleVoiceMemo = () => {
    if (isRecordingAudio) { if(recognitionRef.current) recognitionRef.current.stop(); setIsRecordingAudio(false); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Navegador sin soporte de voz.");
    recognitionRef.current = new SpeechRecognition(); recognitionRef.current.lang = 'es-ES'; recognitionRef.current.interimResults = true;
    let finalTranscript = "";
    recognitionRef.current.onresult = (e) => { const current = Array.from(e.results).map(r => r[0].transcript).join(''); setAudioTranscript(current); if (e.results[0].isFinal) finalTranscript = current; };
    recognitionRef.current.onend = () => { setIsRecordingAudio(false); setAudioTranscript(""); if (finalTranscript.trim()) send(`[Mensaje de Audio en Vivo]: ${finalTranscript}`, null, true); };
    recognitionRef.current.start(); setIsRecordingAudio(true);
  }

  const speakText = (text) => { if (window.speechSynthesis.speaking) return window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/[#*_]/g, '').replace(/```[\s\S]*?```/g, "Código omitido.")); u.lang = 'es-ES'; window.speechSynthesis.speak(u); }
  const handleEditMsg = (index, content) => { setEditingIndex(index); setEditText(typeof content === 'string' ? content : content[0]?.text || ""); }
  const saveEditAndSend = () => { if (!editText.trim()) return; const newMsgs = msgs.slice(0, editingIndex); setChats(p => p.map(c => c.id === activeChat ? {...c, msgs: newMsgs} : c)); setEditingIndex(null); send(editText, newMsgs); }
  const handleRegenerate = (index) => { const userMsgIndex = index - 1; if(userMsgIndex < 0) return; const msgToResend = msgs[userMsgIndex].content; const newMsgs = msgs.slice(0, userMsgIndex); setChats(p => p.map(c => c.id === activeChat ? {...c, msgs: newMsgs} : c)); send(typeof msgToResend === 'string' ? msgToResend : msgToResend[0].text, newMsgs); }

  // 🎧 LECTOR MULTIMODAL (Imágenes, PDF, Word, Audios de Groq)
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (['jpg','jpeg','png','webp'].includes(ext)) { 
      const reader = new FileReader(); reader.onload = (evt) => { setAttachedImg(evt.target.result); setShowPlus(false); }; reader.readAsDataURL(file); e.target.value = ""; return; 
    }
    
    if (['mp3','wav','m4a','ogg','flac'].includes(ext)) {
      if (!apiKey || !apiKey.startsWith("gsk_")) { alert("Configura tu Llave Groq API para transcribir audios."); e.target.value = ""; return; }
      if (file.size > 25 * 1024 * 1024) { alert("Máximo 25MB para audio."); e.target.value = ""; return; }
      setStreaming(`🎧 *Escuchando y transcribiendo ${file.name}...*`);
      try {
        const formData = new FormData(); formData.append("file", file); formData.append("model", "whisper-large-v3");
        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: formData });
        if (!res.ok) throw new Error("Fallo en transcripción.");
        const data = await res.json();
        setAttachedFiles(prev =>[...prev, { name: file.name, text: `[TRANSCRIPCIÓN]:\n${data.text}`, isAudio: true }]);
      } catch (err) { alert("Error al transcribir el audio: " + err.message); }
      setStreaming(""); setShowPlus(false); e.target.value = ""; return;
    }

    setStreaming(`📄 *Procesando ${file.name}...*`);
    try {
      let extractedText = "";
      if (ext === 'pdf') {
        if (!window.pdfjsLib) { await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js"; }
        const arrayBuffer = await file.arrayBuffer(); const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
        for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const content = await page.getTextContent(); extractedText += content.items.map(item => item.str).join(" ") + "\n"; }
      } 
      else if (['doc', 'docx'].includes(ext)) {
        if (!window.mammoth) { await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.21/mammoth.browser.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
        const arrayBuffer = await file.arrayBuffer(); const result = await window.mammoth.extractRawText({arrayBuffer: arrayBuffer}); extractedText = result.value;
      } else { extractedText = await file.text(); }
      setAttachedFiles(prev =>[...prev, { name: file.name, text: extractedText, isAudio: false }]);
    } catch { alert("Error al leer archivo."); }
    setStreaming(""); setShowPlus(false); e.target.value = "";
  }

  const downloadImage = async (url) => { try { const res = await fetch(url); const blob = await res.blob(); saveAs(blob, `Nova-Imagen.jpg`); } catch { window.open(url, '_blank'); } };
  const downloadVideo = async (url) => { try { const res = await fetch(url); const blob = await res.blob(); saveAs(blob, `Nova-Video.mp4`); } catch { window.open(url, '_blank'); } };
  
  const handleExportPDF = () => { const element = document.getElementById('chat-export-area'); html2pdf().set({ margin:[0.5, 0.5], filename: `Nova-Documento.pdf`, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } }).from(element).save(); setShowExport(false); };
  const handleExportWord = async () => { const children =[new Paragraph({ text: chat.title, heading: HeadingLevel.HEADING_1 })]; msgs.forEach(m => { children.push(new Paragraph({ text: m.role === 'user' ? "Tú:" : "Nova:", bold: true, spacing: { before: 200 } })); if(typeof m.content === 'string') { m.content.split('\n').forEach(line => children.push(new Paragraph({ text: line.replace(/#/g, '').replace(/\*/g, '').trim() }))); } }); const doc = new Document({ sections:[{ properties: {}, children }] }); const blob = await Packer.toBlob(doc); saveAs(blob, `Nova-Doc.docx`); setShowExport(false); };
  const handleExportPPT = () => { const pptx = new pptxgen(); pptx.layout = 'LAYOUT_16X9'; const titleSlide = pptx.addSlide(); titleSlide.background = { color: "1a1a1a" }; titleSlide.addText(chat.title, { x: 0.7, y: 2.5, w: 12, h: 1, fontSize: 34, bold: true, color: "ffffff", align: "center" }); msgs.filter(m=>m.role!=="user").forEach((m, idx) => { const text = typeof m.content === "string" ? m.content.replace(/\[VIDEO\].*?\[\/VIDEO\]/g, "[Video generado]") : "[Adjunto]"; const slide = pptx.addSlide(); slide.addText(`Respuesta ${idx + 1}`, { x: 0.5, y: 0.35, w: 12, h: 0.5, fontSize: 22, bold: true, color: "6c47ff" }); slide.addText(text.replace(/[#*`]/g, "").slice(0, 1200), { x: 0.7, y: 1.1, w: 12, h: 5, fontSize: 16, color: "333333", fit: "shrink" }); }); pptx.writeFile({ fileName: "Nova-Presentacion.pptx" }); setShowExport(false); };
  const handleExportExcel = () => { const rows = [["Remitente", "Mensaje", "Fecha"]]; msgs.forEach(m => { const text = typeof m.content === "string" ? m.content.replace(/\[VIDEO\].*?\[\/VIDEO\]/g, "[Video generado]") : "[Adjunto]"; rows.push([m.role === "user" ? "Tú" : "Nova", text.replace(/[*#`]/g, ""), new Date().toLocaleString()]); }); const worksheet = XLSX.utils.aoa_to_sheet(rows); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Conversación"); XLSX.writeFile(workbook, "Nova-Datos.xlsx"); setShowExport(false); };

  // 🚀 FUNCIÓN PRINCIPAL DE IA (CEREBRO)
  const send = useCallback(async (overrideInput = null, historyOverride = null, isAudio = false) => {
    const text = (overrideInput||input).trim();
    if((!text && !attachedImg && attachedFiles.length===0) || loading) return;
    setInput(""); setShowPlus(false); setShowExport(false);

    let finalPromptText = text;
    const currentMsgs = historyOverride || msgs;

    const urlMatches = text.match(/(https?:\/\/[^\s]+)/g);
    if (urlMatches && urlMatches.length > 0) {
      setStreaming("🔗 *Leyendo web...*");
      try {
         const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(urlMatches[0])}`);
         const data = await res.json();
         const doc = new DOMParser().parseFromString(data.contents, 'text/html');
         finalPromptText += `\n\n[Contexto web extraído: ${doc.body.textContent.replace(/\s+/g, ' ').trim().substring(0, 15000)}]`;
      } catch { console.warn("No se pudo leer la URL."); }
    }

    let displayContent = isAudio ? `🎙️ ${text.replace('[Mensaje de Audio en Vivo]: ', '')}` : text;
    let apiSystemContext = finalPromptText !== text ? `\n\n--- CONTEXTO WEB ---\n${finalPromptText.slice(text.length).trim()}` : "";

    if (attachedFiles.length > 0) {
      displayContent = `[${attachedFiles.length} Archivo(s)]\n${displayContent}`;
      apiSystemContext += "\n\n--- ARCHIVOS ADJUNTOS ---\n" + attachedFiles.map(f => `Archivo: ${f.name}\nContenido: ${f.text.substring(0, 20000)}`).join("\n\n");
    }

    let contentToSend = displayContent;
    if (attachedImg) contentToSend =[ { type: "text", text: displayContent || "Analiza esta imagen." }, { type: "image_url", image_url: { url: attachedImg } } ];

    const userMsg = {role:"user", content: contentToSend};
    const newMsgs =[...currentMsgs, userMsg];
    
    setChats(p=>p.map(c=>c.id===activeChat ?{...c,msgs:newMsgs,title:c.msgs.length===0?(text.replace('[Mensaje de Audio en Vivo]: ', '')||"Documento").slice(0,30)+"...":c.title}:c));
    setAttachedImg(null); setAttachedFiles([]); setLoading(true); setStreaming("");

    try {
      const ctrl = new AbortController(); abortRef.current = ctrl;
      const selectedStyle = ESTILOS_VISUALES.find(s => s.id === visualStyle) || ESTILOS_VISUALES[0];

      // 🎬 MODO VIDEO
      if (mode === "video") {
        if (!replicateKey) throw new Error("Falta la API Key de Replicate (Video).");
        setStreaming("🤔 *Traduciendo a formato cinematográfico...*");
        let enhancedPrompt = text.replace('[Mensaje de Audio en Vivo]: ', '');
        try {
            let promptModifier = selectedStyle.id !== "none" ? `Apply this specific visual style heavily: ${selectedStyle.prompt}` : "";
            const aiRes = await fetch("https://text.pollinations.ai/", { method:"POST", signal: ctrl.signal, headers:{"Content-Type":"application/json"}, body:JSON.stringify({ messages:[{role:"system", content:`Translate to English and expand into a highly detailed cinematic video prompt. ${promptModifier} Reply ONLY with prompt.`},{role:"user", content: enhancedPrompt}], model: "openai" }) });
            if (aiRes.ok) enhancedPrompt = await aiRes.text();
        } catch { console.warn("No se pudo mejorar el prompt."); }

        setStreaming("🎥 *Renderizando video 4K en la Nube...*");
        const replicateRes = await fetch("https://api.replicate.com/v1/models/minimax/video-01/predictions", {
            method: "POST", headers: { "Authorization": `Token ${replicateKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ input: { prompt: enhancedPrompt } })
        });
        if (!replicateRes.ok) throw new Error("Error en Replicate.");
        let prediction = await replicateRes.json();

        while (prediction.status !== "succeeded" && prediction.status !== "failed") {
            await new Promise(r => setTimeout(r, 3000));
            const pollRes = await fetch(prediction.urls.get, { headers: { "Authorization": `Token ${replicateKey}` } });
            prediction = await pollRes.json();
            if (prediction.status === "processing") setStreaming("🔥 *Tejiendo fotogramas...*");
        }
        if (prediction.status === "failed") throw new Error("Fallo de renderizado.");
        
        const finalContent = `[VIDEO]${prediction.output}[/VIDEO]\n\n**🎬 Prompt:** \`${enhancedPrompt}\``;
        setChats(p=>p.map(c=>c.id===activeChat ? {...c,msgs:[...newMsgs,{role:"assistant",content:finalContent}]}:c));
        setStreaming(""); setLoading(false); return;
      }

      // 🎨 MODO IMAGEN
      if (mode === "image") {
        setStreaming("🤔 *Razonando idea visual...*"); let enhancedPrompt = text.replace('[Mensaje de Audio en Vivo]: ', '');
        try {
            let promptModifier = selectedStyle.id !== "none" ? `Must include this exact style/aesthetic: ${selectedStyle.prompt}` : "";
            const aiRes = await fetch("https://text.pollinations.ai/", { method:"POST", signal: ctrl.signal, headers:{"Content-Type":"application/json"}, body:JSON.stringify({ messages:[{role:"system", content:`Translate to English and expand into a highly detailed cinematic 8k prompt. ${promptModifier} Reply ONLY with prompt.`},{role:"user", content: enhancedPrompt}], model: "openai" }) });
            if (aiRes.ok) enhancedPrompt = await aiRes.text();
        } catch { console.warn("No se pudo mejorar el prompt."); }
        setStreaming("🖼️ *Renderizando (Flux)...*")
        const randomSeed = Math.floor(Math.random() * 1000000);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&nologo=true&seed=${randomSeed}`
        await new Promise(r => setTimeout(r, 2000));
        const finalContent = `![${text}](${imageUrl})\n\n**✨ Prompt:** \`${enhancedPrompt}\``;
        setChats(p=>p.map(c=>c.id===activeChat ? {...c,msgs:[...newMsgs,{role:"assistant",content:finalContent}]}:c));
        setStreaming(""); setLoading(false); return;
      }

      // 💬 MODO CHAT NORMAL
      const activePersona = PERSONAS.find(p => p.id === persona) || PERSONAS[0];
      let perfilContexto = userProfile.name || userProfile.details ? `\n\n--- INFO DEL USUARIO ---\nNombre: ${userProfile.name}\nContexto: ${userProfile.details}\n` : "";
      let reasoningPrompt = reasoningLevel === "heavy" ? "\n\nTHINK CAREFULLY. Explain your logical reasoning steps before providing the final answer." : "";

      let system = activePersona.prompt + reasoningPrompt + " " + apiSystemContext + perfilContexto;
      if (webSearch) system += " IMPORTANT: You have internet access. Provide real-time facts and search results. Be updated to today.";

      const MAX_HISTORY = 12; 
      const historyToSend = newMsgs.slice(-MAX_HISTORY).map(m => {
          let contentStr = typeof m.content === 'string' ? m.content : (m.content[0]?.text || "[Imagen]");
          contentStr = contentStr.replace(/\[VIDEO\].*?\[\/VIDEO\]/g, '[Video Generado]');
          if (m === userMsg && attachedFiles.length > 0) return { role: m.role, content: contentStr + apiSystemContext }; 
          return { role: m.role, content: contentStr };
      });

      if (!apiKey) {
          const stringifiedHistory = historyToSend.slice(0, -1).map(h => `${h.role === 'user' ? 'Usuario' : 'Nova'}: ${h.content}`).join('\n');
          if (stringifiedHistory.trim() !== "") system += `\n\n--- HISTORIAL ---\n${stringifiedHistory}`;
      }

      let replyText = "";
      if (apiKey && apiKey.startsWith("gsk_")) {
        const modelToUse = attachedImg ? "llama-3.2-11b-vision-preview" : "llama3-8b-8192";
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` }, body: JSON.stringify({ model: modelToUse, messages:[{role:"system", content:system}, ...historyToSend] }) });
        if (!res.ok) throw new Error("Llave API inválida");
        const data = await res.json(); replyText = data.choices[0].message.content;
      } else {
        const selectedModel = webSearch ? "searchgpt" : "openai"; 
        const forcedMessages =[ { role: "system", content: system }, historyToSend[historyToSend.length - 1] ];
        const res = await fetch("https://text.pollinations.ai/", { method:"POST", signal:ctrl.signal, headers:{"Content-Type":"application/json"}, body:JSON.stringify({ messages: forcedMessages, model: selectedModel }) })
        if (!res.ok) throw new Error("Error en conexión");
        replyText = await res.text();
      }
      
      let full = ""; const chunkSize = Math.max(1, Math.floor(replyText.length / 200));
      for (let i = 0; i < replyText.length; i += chunkSize) {
        if (ctrl.signal.aborted) break;
        full += replyText.slice(i, i + chunkSize);
        const blockMatches = (full.match(/```/g) ||[]).length;
        setStreaming(blockMatches % 2 !== 0 ? full + "\n```" : full); await new Promise(r => setTimeout(r, 10));
      }
      setChats(p=>p.map(c=>c.id===activeChat ?{...c,msgs:[...newMsgs,{role:"assistant",content:full||"No pude responder."}]}:c))
      setStreaming("")
    } catch(e) {
      if(e.name!=="AbortError") { setChats(p=>p.map(c=>c.id===activeChat ?{...c,msgs:[...newMsgs,{role:"assistant",content:`⚠️ ${e.message}`}]}:c)); setStreaming("") }
    }
    setLoading(false)
  },[input, msgs, activeChat, mode, persona, loading, apiKey, replicateKey, attachedImg, attachedFiles, webSearch, userProfile, visualStyle, reasoningLevel])

  const hk = e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()} }
  const stopStream = () => { abortRef.current?.abort(); setLoading(false); setStreaming(""); }

  // 🛠️ COMPONENTES MARKDOWN Y RENDERIZADO VISUAL
  const MarkdownComponents = {
    code({inline, className, children, ...props}) {
      const match = /language-(\w+)/.exec(className || '')
      let codeString = String(children).replace(/\n$/, ''); let fileName = "";
      if (!inline && match) {
        const firstLine = codeString.split('\n')[0];
        if (firstLine.match(/^(\/\/|#|<!--|\/\*)\s*([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/)) {
          fileName = firstLine.replace(/^(\/\/|#|<!--|\/\*)\s*/, '').replace(/\*\/$/, '').trim();
          codeString = codeString.substring(firstLine.length + 1).trim();
        }
      }
      const isRenderable = match && (match[1] === 'html' || match[1] === 'xml' || match[1] === 'svg');
      return !inline && match ? (
        <div className="avoid-break" style={{ position: 'relative', margin: '16px 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ background: '#161b22', color: '#8b949e', padding: '10px 16px', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #30363d' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
               <div style={{display:'flex', gap:'6px'}}><div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#ff5f56'}}></div><div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#ffbd2e'}}></div><div style={{width:'10px', height:'10px', borderRadius:'50%', background:'#27c93f'}}></div></div>
               {fileName ? ( <span style={{ color: '#e6edf3', fontWeight: '600', fontFamily: 'monospace' }}>📄 {fileName}</span> ) : ( <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{match[1]}</span> )}
            </div>
            <div style={{display: 'flex', gap: '8px'}}>
              {isRenderable && ( <button onClick={() => setArtifactCode(codeString)} style={{ background: '#6c47ff', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', padding: '4px 12px', fontSize: 11, fontWeight: 'bold' }}>▶️ Ejecutar UI</button> )}
              <button onClick={(e) => { navigator.clipboard.writeText(codeString); e.target.innerText = "Copiado!"; setTimeout(()=> e.target.innerText = "Copiar", 2000) }} style={{ background: '#21262d', border: '1px solid #444c56', color: '#c9d1d9', borderRadius: 6, cursor: 'pointer', padding: '4px 10px', fontSize: 11, fontWeight: '600' }}>Copiar</button>
            </div>
          </div>
          <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: '16px', fontSize: '13.5px', fontFamily: "'Fira Code', 'Consolas', monospace", lineHeight: 1.6 }} {...props}>{codeString}</SyntaxHighlighter>
        </div>
      ) : ( <code style={{ background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4, color: '#6c47ff', fontSize: '13.5px', fontFamily: 'monospace' }} {...props}>{children}</code> )
    },
    img({src, alt, ...props}) {
      return (
        <div className="avoid-break img-container" style={{ position: "relative", display: "inline-block", margin: "16px 0", textAlign: "center", width: "100%" }}>
          <img {...props} src={src} alt={alt || "Imagen"} style={{ maxWidth: '100%', maxHeight: '500px', borderRadius: '16px', border: '1px solid var(--border)', objectFit: 'contain' }} loading="lazy" />
          <button onClick={() => downloadImage(src)} className="dl-btn" style={{ position: "absolute", bottom: "16px", right: "16px", background: "rgba(0,0,0,0.7)", color: "white", border: "1px solid rgba(255,255,255,0.2)", padding: "10px 18px", borderRadius: "12px", cursor: "pointer", fontWeight: "bold", backdropFilter: "blur(8px)", fontSize: "13px" }}>⬇️ Descargar HD</button>
        </div>
      )
    }
  }

  const parseMessageContent = (contentStr) => {
    const videoMatch = contentStr.match(/\[VIDEO\](.*?)\[\/VIDEO\]/);
    if (videoMatch) {
      return (
        <div className="avoid-break" style={{margin: "16px 0"}}>
          <div className="img-container" style={{position:"relative", display:"inline-block", width:"100%", borderRadius:"16px", overflow:"hidden", border:"1px solid var(--border)", boxShadow:"0 8px 24px rgba(0,0,0,0.15)"}}>
             <video src={videoMatch[1]} controls autoPlay loop style={{width:"100%", display:"block", background:"#000"}} />
             <button onClick={() => downloadVideo(videoMatch[1])} className="dl-btn" style={{ position: "absolute", top: "16px", right: "16px", background: "rgba(0,0,0,0.7)", color: "white", border: "1px solid rgba(255,255,255,0.2)", padding: "10px 18px", borderRadius: "12px", cursor: "pointer", fontWeight: "bold", backdropFilter: "blur(8px)", fontSize: "13px", zIndex:20 }}>⬇️ Descargar MP4</button>
          </div>
          <div className="nc" style={{width: "100%", color: "var(--text-main)", marginTop:"16px"}}>
             <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{contentStr.replace(videoMatch[0], '')}</ReactMarkdown>
          </div>
        </div>
      )
    }
    return (
      <div className="nc" style={{width: "100%", color: "var(--text-main)"}}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{contentStr}</ReactMarkdown>
      </div>
    );
  }

  const renderUserMsg = (content) => {
    if (typeof content === 'string') return content;
    return ( <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>{content.map((c, i) => c.type === 'text' ? <span key={i}>{c.text}</span> : <img key={i} src={c.image_url.url} style={{maxWidth:'200px', borderRadius:'8px'}} alt="Uploaded" />)}</div> );
  }

  const actPersona = PERSONAS.find(p=>p.id===persona) || PERSONAS[0];


  if (isCheckingAuth) return <div style={{height: "100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#121212", color:"#fff", fontSize:"20px"}}>Iniciando Sistemas Nova...</div>;
  if (!user) {
    return (
      <div style={{minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#050505", position:"relative", overflow:"hidden", fontFamily:"sans-serif"}}>
        <div style={{position:"absolute", width:"500px", height:"500px", background:"#6c47ff", borderRadius:"50%", filter:"blur(150px)", opacity:0.3, top:"-100px", left:"-100px"}}></div>
        <div style={{position:"absolute", width:"400px", height:"400px", background:"#0ea5e9", borderRadius:"50%", filter:"blur(150px)", opacity:0.2, bottom:"-50px", right:"-50px"}}></div>
        <div style={{zIndex:10, padding:"50px", background:"rgba(255,255,255,0.05)", backdropFilter:"blur(20px)", borderRadius:"24px", border:"1px solid rgba(255,255,255,0.1)", textAlign:"center", boxShadow:"0 25px 50px rgba(0,0,0,0.5)", maxWidth:"400px", width:"90%"}}>
          <div style={{width:80,height:80,borderRadius:20,background:"linear-gradient(135deg,#6c47ff,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,color:"#fff", margin:"0 auto 24px", boxShadow:"0 10px 30px rgba(108,71,255,0.4)"}}>✦</div>
          <h1 style={{color:"#fff", fontSize:"32px", margin:"0 0 10px 0", letterSpacing:"0"}}>Nova Enterprise</h1>
          <p style={{color:"#aaa", fontSize:"15px", margin:"0 0 32px 0", lineHeight:1.5}}>Desarrollado para la productividad extrema. Impulsado por Inteligencia Artificial.</p>
          <button onClick={loginWithGoogle} style={{width:"100%", padding:"14px", borderRadius:"12px", border:"none", background:"#fff", color:"#000", fontSize:"16px", fontWeight:"bold", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:"10px", transition:"0.2s"}}>
            Continuar con Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-theme={isDarkMode ? "dark" : "light"} className="app-container">
      
      {/* ⚡ MODALES GLOBALES (Artefactos y Perfil) */}
      {artifactCode && (
        <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:99999, display:"flex", flexDirection:"column", padding:"20px"}}>
          <div style={{display:"flex", justifyContent:"space-between", background:"#161b22", padding:"12px 20px", borderRadius:"12px 12px 0 0", borderBottom:"1px solid #30363d"}}>
            <span style={{color:"#fff", fontWeight:"bold", display:"flex", alignItems:"center", gap:"8px"}}>⚡ Nova Artifacts <span style={{fontSize:"11px", background:"#6c47ff", padding:"2px 6px", borderRadius:"4px"}}>Live Preview</span></span>
            <button onClick={() => setArtifactCode(null)} style={{background:"#ff5f56", border:"none", borderRadius:"50%", width:"24px", height:"24px", color:"#fff", cursor:"pointer", fontWeight:"bold"}}>×</button>
          </div>
          <div style={{flex:1, background:"#fff", borderRadius:"0 0 12px 12px", overflow:"hidden"}}>
            <iframe srcDoc={artifactCode} style={{width:"100%", height:"100%", border:"none"}} sandbox="allow-scripts allow-forms allow-popups allow-modals" />
          </div>
        </div>
      )}

      {showProfileModal && (
        <div style={{position:"absolute", inset:0, background:"rgba(0,0,0,0.6)", backdropFilter:"blur(5px)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px"}}>
          <div style={{background:"var(--bg-main)", borderRadius:"20px", padding:"24px", width:"100%", maxWidth:"400px", border:"1px solid var(--border)", boxShadow:"0 20px 40px rgba(0,0,0,0.3)"}}>
            <h3 style={{marginTop:0, marginBottom:"16px", color:"var(--text-main)", display:"flex", alignItems:"center", gap:"8px"}}>👤 Memoria de Nova</h3>
            <label style={{display:"block", fontSize:"13px", fontWeight:"bold", marginBottom:"6px", color:"var(--text-main)"}}>¿Cómo te llamas?</label>
            <input type="text" value={userProfile.name} onChange={e=>setUserProfile({...userProfile, name: e.target.value})} style={{width:"100%", padding:"12px", borderRadius:"10px", border:"1px solid var(--border)", background:"var(--bg-input)", color:"var(--text-main)", marginBottom:"16px", boxSizing:"border-box", outline:"none"}} placeholder="Tu nombre..." />
            <label style={{display:"block", fontSize:"13px", fontWeight:"bold", marginBottom:"6px", color:"var(--text-main)"}}>Detalles clave (Contexto)</label>
            <textarea value={userProfile.details} onChange={e=>setUserProfile({...userProfile, details: e.target.value})} style={{width:"100%", padding:"12px", borderRadius:"10px", border:"1px solid var(--border)", background:"var(--bg-input)", color:"var(--text-main)", marginBottom:"24px", minHeight:"80px", boxSizing:"border-box", resize:"none", outline:"none"}} placeholder="Ej. Soy programador. Dame respuestas técnicas." />
            <div style={{display:"flex", justifyContent:"flex-end", gap:"10px"}}>
              <button onClick={()=>setShowProfileModal(false)} style={{padding:"10px 16px", background:"transparent", border:"none", color:"var(--text-muted)", cursor:"pointer", fontWeight:"bold"}}>Cerrar</button>
              <button onClick={()=>setShowProfileModal(false)} style={{padding:"10px 16px", background:"#6c47ff", color:"#fff", border:"none", borderRadius:"10px", cursor:"pointer", fontWeight:"bold"}}>Guardar Memoria</button>
            </div>
          </div>
        </div>
      )}

      {isMobile && sideOpen && (<div onClick={()=>setSideOpen(false)} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.5)",zIndex:40}}/>)}

      {/* ── SIDEBAR ── */}
      <div className="sidebar" style={{ transform: sideOpen ? "translateX(0)" : "translateX(-100%)", display: sideOpen || !isMobile ? "flex" : "none" }}>
        <div style={{padding:"16px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:6,background:"linear-gradient(135deg,#6c47ff,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff"}}>✦</div>
            <span style={{fontWeight:700,fontSize:16,letterSpacing:"-0.3px", color:"var(--text-main)"}}>Nova Enterprise</span>
          </div>
          {isMobile && <button onClick={()=>setSideOpen(false)} style={{background:"none",border:"none",fontSize:22,color:"var(--text-muted)"}}>×</button>}
        </div>

        {user && (
          <div style={{padding:"0 14px 14px", display:"flex", alignItems:"center", gap:"10px", borderBottom:"1px solid var(--border)", marginBottom:"10px"}}>
            <img src={user.photoURL} alt="perfil" style={{width:"36px", height:"36px", borderRadius:"50%"}} />
            <div style={{flex:1, overflow:"hidden"}}>
              <div style={{fontSize:"13px", fontWeight:"bold", color:"var(--text-main)", whiteSpace:"nowrap", textOverflow:"ellipsis", overflow:"hidden"}}>{user.displayName}</div>
              <button onClick={logout} style={{background:"none", border:"none", color:"#ef4444", fontSize:"11px", padding:0, cursor:"pointer"}}>Cerrar sesión</button>
            </div>
          </div>
        )}
        
        <div style={{padding:"4px 10px"}}>
          <button onClick={newChat} style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:9,background:"var(--btn-primary)",color:"#fff",fontWeight:600,fontSize:13,textAlign:"left",marginBottom:10}}>
            <span style={{fontSize:16}}>+</span> Nuevo chat
          </button>
          <input type="text" placeholder="🔍 Buscar chat..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} style={{width:"100%", padding:"8px 12px", borderRadius:"8px", border:"1px solid var(--border)", background:"var(--bg-input)", color:"var(--text-main)", fontSize:"13px", outline:"none", boxSizing:"border-box", marginBottom:"10px"}} />
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"2px 10px"}}>
          {filteredChats.map(c=>(
            <div key={c.id} className="chat-item" style={{display:"flex", alignItems:"center", borderRadius:8, background:c.id===activeChat?"var(--bg-active)":"transparent", marginBottom:2}}>
              <button onClick={()=>{setActive(c.id); if(isMobile) setSideOpen(false)}} style={{flex:1,padding:"10px 10px",border:"none",cursor:"pointer",background:"transparent",color:c.id===activeChat?"#6c47ff":"var(--text-main)",fontSize:13,textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontWeight:c.id===activeChat?600:400}}>
                {c.pinned ? "📌" : "💬"} {c.title}
              </button>
              <div className="chat-actions" style={{display: "flex"}}>
                 <button onClick={(e)=>togglePinChat(e, c.id)} style={{padding:"10px 5px", background:"transparent", border:"none", color:"var(--text-muted)", cursor:"pointer"}} title={c.pinned ? "Desfijar" : "Fijar Chat"}>📌</button>
                 <button onClick={(e)=>deleteChat(e, c.id)} style={{padding:"10px 5px", background:"transparent", border:"none", color:"var(--text-muted)", cursor:"pointer"}} title="Eliminar">🗑️</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{padding:"12px", borderTop:"1px solid var(--border)", display:"flex", justifyItems: "center", justifyContent:"space-around"}}>
           <button onClick={()=>setIsDarkMode(!isDarkMode)} className="icon-btn" title="Modo Oscuro">{isDarkMode ? "☀️" : "🌙"}</button>
           <button onClick={exportWorkspace} className="icon-btn" title="Descargar Backup Local">💾</button>
           <button onClick={() => backupInputRef.current?.click()} className="icon-btn" title="Restaurar Backup Local">📂</button>
        </div>
      </div>

      {/* ── MENÚ PERSONAJES ── */}
      {showPersonas && (
        <div style={{position:"absolute", bottom:"60px", left:"20px", background:"var(--bg-side)", border:"1px solid var(--border)", borderRadius:"12px", padding:"8px", zIndex:100, width:"220px", boxShadow:"0 10px 25px rgba(0,0,0,0.2)"}}>
          <div style={{fontSize:"11px", fontWeight:"bold", color:"var(--text-muted)", marginBottom:"8px", textTransform:"uppercase"}}>Elegir Agente</div>
          {PERSONAS.map(p => (
            <button key={p.id} onClick={()=>{setPersona(p.id); setShowPersonas(false); if(p.id==="coder") setMode("code"); if(p.id==="director") setMode("video");}} style={{width:"100%", padding:"8px", textAlign:"left", background: persona===p.id?"var(--bg-active)":"transparent", border:"none", borderRadius:"6px", color:"var(--text-main)", cursor:"pointer", display:"flex", gap:"8px", alignItems:"center"}}>
              <span>{p.icon}</span> <span style={{fontWeight: persona===p.id?"bold":"normal"}}>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── ÁREA PRINCIPAL ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0, position:"relative", zIndex:10}}>
        
        <div className="header" style={{padding:"12px 18px",display:"flex",alignItems:"center",gap:12,borderBottom:"1px solid var(--border)",backdropFilter:"blur(10px)"}}>
          {!sideOpen && ( <button onClick={()=>setSideOpen(true)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",fontSize:20}}>☰</button> )}
          
          <div style={{display:"flex", alignItems:"center", gap:"8px", background:"var(--bg-input)", padding:"4px", borderRadius:"12px"}}>
            <button onClick={()=>setReasoningLevel("fast")} style={{padding:"4px 12px", border:"none", borderRadius:"8px", background:reasoningLevel==="fast"?"var(--bg-main)":"transparent", color:reasoningLevel==="fast"?"var(--text-main)":"var(--text-muted)", fontWeight:reasoningLevel==="fast"?"bold":"normal", fontSize:"12px", cursor:"pointer", boxShadow:reasoningLevel==="fast"?"0 2px 4px rgba(0,0,0,0.05)":"none"}}>⚡ Fast</button>
            <button onClick={()=>setReasoningLevel("heavy")} style={{padding:"4px 12px", border:"none", borderRadius:"8px", background:reasoningLevel==="heavy"?"var(--bg-main)":"transparent", color:reasoningLevel==="heavy"?"var(--text-main)":"var(--text-muted)", fontWeight:reasoningLevel==="heavy"?"bold":"normal", fontSize:"12px", cursor:"pointer", boxShadow:reasoningLevel==="heavy"?"0 2px 4px rgba(0,0,0,0.05)":"none"}}>🧠 Heavy</button>
          </div>

          <span style={{fontSize:15,fontWeight:600,color:"var(--text-main)",flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textAlign:"right"}}>
            {chat?.title||"Nueva conversación"}
          </span>
          {persona !== "nova" && <span style={{padding:"3px 8px", borderRadius:"20px", background:"#f3e8ff", color:"#9333ea", fontSize:"11px", fontWeight:"600", cursor:"pointer"}} onClick={()=>setShowPersonas(!showPersonas)}>{actPersona.icon} {actPersona.label}</span>}
          
          {webSearch && <span style={{padding:"3px 8px",borderRadius:"20px",background:"#dbeafe",color:"#2563eb",fontSize:"11px",fontWeight:"600"}}>🌐 Internet</span>}
          
          {msgs.length>0&&(
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowExport(!showExport)} style={{padding:"6px 14px",borderRadius:20,border:"1px solid var(--border)",background:"var(--bg-input)",cursor:"pointer",fontSize:13,fontWeight:600,color:"var(--text-main)", display:"flex", alignItems:"center", gap:6}}>⬇️ Exportar</button>
              {showExport && (
                <div style={{position:"absolute", top:"calc(100% + 8px)", right:0, background:"var(--bg-main)", borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", border:"1px solid var(--border)", zIndex:100, minWidth:180, overflow:"hidden"}}>
                  <button onClick={handleExportPDF} className="export-menu-btn">📄 Documento PDF</button>
                  <button onClick={handleExportPPT} className="export-menu-btn">🖥️ PowerPoint</button>
                  <button onClick={handleExportWord} className="export-menu-btn">📝 Word (.docx)</button>
                  <button onClick={handleExportExcel} className="export-menu-btn" style={{borderBottom:"none"}}>📊 Excel</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div id="chat-export-area" className="chat-box" style={{flex:1,overflowY:"auto", paddingBottom:"40px"}} ref={chatBoxRef} onScroll={handleScroll}>
          {msgs.length===0&&!streaming?(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:16,padding:20, textAlign:"center"}}>
              <div style={{width:64,height:64,borderRadius:18,background:"linear-gradient(135deg,#6c47ff,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,color:"#fff", boxShadow:"0 10px 30px rgba(108,71,255,0.3)"}}>{actPersona.icon}</div>
              <div style={{fontSize:24,fontWeight:700,color:"var(--text-main)"}}>¿Por dónde deberíamos empezar?</div>
              <p style={{color:"var(--text-muted)", fontSize:14, maxWidth:400, marginTop:0}}>Sube documentos, genera código, busca en internet o crea Arte. {userProfile.name ? `¡Hola de nuevo, ${userProfile.name}!` : ""}</p>
              
              <div style={{display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:12, maxWidth:600, marginTop:20, width:"100%"}}>
                {SUGERENCIAS_DINAMICAS.slice(0, 4).map((sug, i) => (
                    <button key={i} onClick={() => {setMode(sug.type); setPersona(sug.type==="tutor"?"tutor":sug.type==="code"?"coder":"nova"); send(sug.text)}} 
                            className="suggestion-btn">
                      <span style={{fontSize:"18px"}}>{sug.icon}</span>
                      <div style={{textAlign:"left"}}>
                        <div style={{fontWeight:"600", color:"var(--text-main)"}}>{sug.text}</div>
                        <div style={{fontSize:"12px", color:"var(--text-muted)"}}>Pulsa para iniciar</div>
                      </div>
                    </button>
                ))}
              </div>
            </div>
          ):(
            <div style={{maxWidth:760,margin:"0 auto",padding:"24px 16px", paddingBottom: "100px"}}>
              {msgs.map((m,i)=>{
                const isUser = m.role === "user";
                return (
                  <div key={i} className="avoid-break" style={{marginBottom: 26, display: "flex", gap: 12, alignItems: "flex-start", flexDirection: isUser ? "row-reverse" : "row"}}>
                    <div style={{width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: isUser ? "#ede9fc" : "linear-gradient(135deg,#6c47ff,#a855f7)", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", fontSize: 14, color: isUser ? "#6c47ff" : "#fff", fontWeight: 700}}>
                      {isUser ? "T" : actPersona.icon}
                    </div>
                    <div style={{flex: 1, display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", maxWidth: "calc(100% - 44px)"}}>
                      <div style={{fontWeight: 600, fontSize: 13, marginBottom: 6, color: isUser ? "#6c47ff" : "var(--text-muted)", display:"flex", alignItems:"center", gap:"8px"}}>
                        {isUser ? (userProfile.name || "Tú") : actPersona.label}
                        {isUser ? ( <button onClick={()=>handleEditMsg(i, m.content)} className="action-btn" title="Editar">✏️</button> ) : (
                          <>
                            <button onClick={()=>speakText(typeof m.content === 'string' ? m.content : "")} className="action-btn" title="Leer">🔊</button>
                            <button onClick={()=>handleRegenerate(i)} className="action-btn" title="Regenerar">🔄</button>
                          </>
                        )}
                      </div>
                      
                      {isUser ? (
                        editingIndex === i ? (
                           <div style={{width:"100%", background:"var(--bg-input)", padding:"10px", borderRadius:"12px", border:"1px solid var(--border)"}}>
                             <textarea value={editText} onChange={e=>setEditText(e.target.value)} style={{width:"100%", background:"transparent", border:"none", color:"var(--text-main)", outline:"none", minHeight:"60px", resize:"vertical"}} />
                             <div style={{display:"flex", justifyContent:"flex-end", gap:"8px", marginTop:"8px"}}>
                               <button onClick={()=>setEditingIndex(null)} style={{padding:"6px 12px", background:"transparent", color:"var(--text-muted)", border:"none", cursor:"pointer"}}>Cancelar</button>
                               <button onClick={saveEditAndSend} style={{padding:"6px 12px", background:"#6c47ff", color:"#fff", border:"none", borderRadius:"6px", cursor:"pointer"}}>Guardar</button>
                             </div>
                           </div>
                        ) : (
                          <div style={{background: "var(--bg-user-msg)", padding: "12px 18px", borderRadius: "20px", borderTopRightRadius: "4px", fontSize: 15, lineHeight: 1.5, color: "var(--text-user-msg)", wordBreak: "break-word", whiteSpace: "pre-wrap", textAlign: "left", display:"inline-block"}}>{renderUserMsg(m.content)}</div>
                        )
                      ) : (
                        parseMessageContent(typeof m.content === 'string' ? m.content : "")
                      )}
                    </div>
                  </div>
                )
              })}

              {streaming&&(
                <div className="avoid-break" style={{marginBottom:26,display:"flex",gap:12,alignItems:"flex-start", flexDirection:"row"}}>
                  <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:"linear-gradient(135deg,#6c47ff,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:"#fff",fontWeight:700}}>{actPersona.icon}</div>
                  <div style={{flex: 1, display:"flex", flexDirection:"column", alignItems:"flex-start"}}>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:6,color:"var(--text-muted)", paddingLeft:4}}>{actPersona.label}</div>
                    <div style={{width:"100%", color:"var(--text-main)"}}>
                      <div className="nc" style={{display:"inline"}}>
                         <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{streaming}</ReactMarkdown>
                      </div>
                      <span style={{display:"inline-block",width:8,height:16,background:"#6c47ff",borderRadius:2,marginLeft:4,animation:"blink 0.8s infinite"}}/>
                    </div>
                  </div>
                </div>
              )}
              {loading&&!streaming&&(
                <div style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:26, flexDirection:"row"}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#6c47ff,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff",fontWeight:700}}>✦</div>
                  <div style={{display:"flex",gap:5, padding:"12px 4px"}}>{[0,1,2].map(j=><div key={j} style={{width:8,height:8,borderRadius:"50%",background:"#6c47ff",opacity:0.6,animation:`bop 1s ${j*0.2}s infinite`}}/>)}</div>
                </div>
              )}
              <div ref={bottomRef} style={{height: 10}}/>
            </div>
          )}
        </div>
        
        {showScrollBottom && (
          <button 
            onClick={() => bottomRef.current?.scrollIntoView({behavior:"smooth"})}
            style={{position:"absolute", bottom:"120px", left:"50%", transform:"translateX(-50%)", background:"var(--bg-main)", color:"var(--text-main)", border:"1px solid var(--border)", borderRadius:"50%", width:"40px", height:"40px", display:"flex", alignItems:"center", justifyItems: "center", justifyContent:"center", cursor:"pointer", boxShadow:"0 4px 12px rgba(0,0,0,0.1)", zIndex:20}}>
            ⬇️
          </button>
        )}

        {/* ── CAJA DE TEXTO ── */}
        <div style={{padding:"12px 16px 20px",flexShrink:0, background:"var(--bg-gradient)", position:"absolute", bottom:0, width:"100%", zIndex:30}}>
          <div style={{maxWidth:760,margin:"0 auto",position:"relative"}} className="plus-area">

            <input type="file" ref={fileInputRef} style={{display:'none'}} accept=".txt,.json,.js,.py,.md,.csv,.html,.css,.doc,.docx,.pdf,.jpg,.jpeg,.png,.webp,.mp3,.wav,.m4a,.ogg,.flac" onChange={handleFileUpload} />
            <input type="file" ref={backupInputRef} style={{display:'none'}} accept=".nova" onChange={importWorkspace} />

            {isRecordingAudio && (
               <div style={{position: "absolute", bottom: "100%", left: "0", width: "100%", background: "#ef4444", padding: "12px 20px", borderRadius: "16px", color: "white", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", boxShadow: "0 10px 25px rgba(239, 68, 68, 0.4)", zIndex: 50}}>
                  <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
                     <span style={{display: "inline-block", width: "12px", height: "12px", background: "white", borderRadius: "50%", animation: "blink 1s infinite"}}></span>
                     <span>Grabando Nota de Voz...</span>
                  </div>
                  <span style={{fontSize: "14px", opacity: 0.8, maxWidth:"50%", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{audioTranscript || "Escuchando..."}</span>
                  <button onClick={handleVoiceMemo} style={{background: "white", color: "#ef4444", border: "none", padding: "6px 16px", borderRadius: "20px", fontWeight: "bold", cursor: "pointer"}}>Enviar ⬆️</button>
               </div>
            )}

            <div style={{display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: attachedImg || attachedFiles.length > 0 ? "10px" : "0"}}>
              {attachedImg && (
                <div style={{position:"relative", display:"inline-block"}}>
                  <img src={attachedImg} style={{height:"60px", borderRadius:"8px", border:"2px solid #6c47ff"}} alt="Preview" />
                  <button onClick={()=>setAttachedImg(null)} style={{position:"absolute", top:"-6px", right:"-6px", background:"#333", color:"#fff", border:"none", borderRadius:"50%", width:"20px", height:"20px", cursor:"pointer", fontSize:"12px"}}>×</button>
                </div>
              )}
              {attachedFiles.map((file, idx) => (
                 <div key={idx} style={{background:"var(--bg-active)", color:"#6c47ff", padding:"6px 12px", borderRadius:"16px", fontSize:"13px", fontWeight:"600", display:"flex", alignItems:"center", gap:"6px", border:"1px solid rgba(108,71,255,0.2)"}}>
                    {file.isAudio ? "🎧" : "📄"} {file.name}
                    <button onClick={()=>setAttachedFiles(prev => prev.filter((_, i) => i !== idx))} style={{background:"none", border:"none", color:"#6c47ff", cursor:"pointer", fontWeight:"bold"}}>×</button>
                 </div>
              ))}
            </div>

            {showPlus&&(
              <div style={{position:"absolute",bottom:"calc(100% + 12px)",left:0,background:"var(--bg-main)",borderRadius:16,boxShadow:"0 12px 40px rgba(0,0,0,0.3)",zIndex:100,minWidth:250,border:"1px solid var(--border)", padding:"8px 0"}}>
                <MenuItem icon="⚙️" label="Llave Groq API (Text & Audio)" onClick={()=>{ const c = prompt("Ingresa llave Groq para Transcripciones y Text-Gen:", apiKey); if(c!==null) {setApiKey(c.trim()); localStorage.setItem("nova-apikey", c.trim());} }} check={!!apiKey} blue={!!apiKey}/>
                <MenuItem icon="🎥" label="Llave Replicate (Video)" onClick={()=>{ const c = prompt("Ingresa token de Replicate.com (necesario para video):", replicateKey); if(c!==null) { setReplicateKey(c.trim()); localStorage.setItem("nova-replicate-key", c.trim());} }} check={!!replicateKey} blue={!!replicateKey}/>
                <div style={{height:1,background:"var(--border)",margin:"6px 12px"}}/>
                <MenuItem icon="👤" label="Mi Perfil (Memoria)" onClick={()=>{setShowProfileModal(true); setShowPlus(false);}} />
                <MenuItem icon="📎" label="Subir Archivo, Foto o Audio" onClick={() => fileInputRef.current?.click()} />
                <MenuItem icon="🌐" label="Búsqueda Web (RAG)" blue={webSearch} check={webSearch} onClick={() => {setWebSearch(!webSearch); setShowPlus(false)}} />
                <div style={{height:1,background:"var(--border)",margin:"6px 12px"}}/>
                
                {(mode === "image" || mode === "video") && (
                   <div style={{padding:"4px 12px", background:"var(--bg-active)", margin:"0 10px 10px", borderRadius:"8px"}}>
                     <div style={{fontSize:"10px", color:"#6c47ff", fontWeight:"bold", marginBottom:"4px", textTransform:"uppercase"}}>Plantilla Visual</div>
                     <select value={visualStyle} onChange={e=>setVisualStyle(e.target.value)} style={{width:"100%", background:"transparent", border:"none", color:"var(--text-main)", fontSize:"13px", outline:"none", cursor:"pointer"}}>
                        {ESTILOS_VISUALES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                     </select>
                   </div>
                )}

                <div style={{padding:"8px 16px 4px",fontSize:11,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:"0.5px",fontWeight:700}}>Modos IA</div>
                {[{ id:"code", icon:"</>", label:"Programador" }, { id:"image", icon:"🎨", label:"Generar Arte" }, {id:"video", icon:"🎬", label:"Generar Video"}].map(opt=>(
                  <MenuItem key={opt.id} icon={opt.icon} label={opt.label} check={mode===opt.id} onClick={()=>{setMode(opt.id);setShowPlus(false)}}/>
                ))}
              </div>
            )}

            <div style={{border: mode==="image"?"2px solid #ec4899": mode==="code"?"2px solid #0ea5e9": mode==="video"?"2px solid #f59e0b" : "1px solid var(--border)",borderRadius:"24px",background:"var(--bg-input)",boxShadow:"var(--composer-shadow)", padding:"4px", transition:"all 0.3s"}}>
              <textarea ref={textRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={hk} disabled={editingIndex !== null || isRecordingAudio}
                placeholder={isRecordingAudio ? "Escuchando voz..." : editingIndex !== null ? "Editando mensaje..." : "Pregunta a Nova o sube un audio..."}
                style={{width:"100%",padding:"14px 16px 4px",border:"none",background:"transparent",color:"var(--text-main)",fontSize:16,resize:"none",outline:"none",fontFamily:"inherit",lineHeight:1.5,minHeight:54,maxHeight:200,boxSizing:"border-box"}}/>
              
              <div style={{display:"flex",alignItems:"center",padding:"4px 8px 8px",gap:8}}>
                <button onClick={()=>{setShowPlus(!showPlus)}} style={{width:36,height:36,borderRadius:"50%",border:"1px solid var(--border)",background:showPlus?"var(--bg-active)":"var(--bg-main)",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",color:showPlus?"#6c47ff":"var(--text-main)", transition:"0.2s"}}>+</button>
                <button onClick={handleVoiceMemo} style={{width:36,height:36,borderRadius:"50%",border:"none",background:isRecordingAudio?"#ef4444":"transparent",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",color:isRecordingAudio?"#fff":"var(--text-muted)", transition:"0.2s", boxShadow: isRecordingAudio?"0 0 15px rgba(239,68,68,0.5)": "none"}} title="Grabar Nota de Voz">
                  {isRecordingAudio ? "⏹️" : "🎙️"}
                </button>

                {mode!=="chat"&&( <span onClick={()=>setMode("chat")} style={{padding:"6px 14px",borderRadius:20,background:`rgba(108,71,255,0.1)`,color:"#6c47ff",fontSize:12,fontWeight:600,border:`1px solid rgba(108,71,255,0.2)`,cursor:"pointer"}}>{mode} ×</span> )}
                <div style={{flex:1}}/>
                {loading
                  ?<button onClick={stopStream} style={{width:38,height:38,borderRadius:"50%",border:"1px solid var(--border)",cursor:"pointer",background:"var(--bg-main)",color:"var(--text-muted)",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>■</button>
                  :<button onClick={()=>send()} disabled={(!input.trim() && !attachedImg && attachedFiles.length===0) && !isRecordingAudio} style={{width:38,height:38,borderRadius:"50%",border:"none",cursor:(input.trim()||attachedImg||attachedFiles.length>0)?"pointer":"default",background:(input.trim()||attachedImg||attachedFiles.length>0)?(mode==="image"?"#ec4899":mode==="video"?"#f59e0b":"#000"):"var(--btn-disabled)",color:"#fff",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",transition:"0.2s"}}>↑</button>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        :root { --bg-main: #ffffff; --bg-side: #f9f9f9; --text-main: #0d0d0d; --text-muted: #666666; --border: #e5e5e5; --bg-hover: #f0f0f0; --bg-input: #f4f4f4; --bg-user-msg: #f3f3f3; --text-user-msg: #0d0d0d; --bg-active: #ede9fc; --btn-primary: #111111; --btn-disabled: #e5e5e5; --bg-gradient: linear-gradient(180deg, rgba(255,255,255,0) 0%, #ffffff 20%); --composer-shadow: 0 0 15px rgba(0,0,0,0.05); }[data-theme="dark"] { --bg-main: #212121; --bg-side: #171717; --text-main: #ececec; --text-muted: #a1a1aa; --border: #2f2f2f; --bg-hover: #2f2f2f; --bg-input: #2f2f2f; --bg-user-msg: #2f2f2f; --text-user-msg: #ececec; --bg-active: rgba(108, 71, 255, 0.2); --btn-primary: #6c47ff; --btn-disabled: #3f3f46; --bg-gradient: linear-gradient(180deg, rgba(33,33,33,0) 0%, #212121 20%); --composer-shadow: 0 0 15px rgba(0,0,0,0.2); }
        
        body { background: var(--bg-main); margin: 0; }
        .app-container { background: var(--bg-main); color: var(--text-main); height: 100vh; overflow:hidden;}
        .sidebar { background: var(--bg-side); border-right: 1px solid var(--border); }
        .header { background: rgba(var(--bg-main-rgb), 0.9); border-bottom: 1px solid var(--border); }
        .icon-btn { background:transparent; border:none; color:var(--text-muted); font-size:18px; cursor:pointer; padding:6px; border-radius:8px; transition: 0.2s;}
        .icon-btn:hover { background: var(--bg-hover); color: var(--text-main); }
        .chat-actions { opacity: 0; transition: opacity 0.2s; }
        .chat-item:hover .chat-actions { opacity: 1; }
        .action-btn { background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:13px; opacity:0; transition:0.2s; }
        .avoid-break:hover .action-btn { opacity: 1; }
        
        .export-menu-btn { width:100%; padding:10px 14px; border:none; background:transparent; text-align:left; cursor:pointer; font-size:14px; color:var(--text-main); border-bottom:1px solid var(--border); }
        .export-menu-btn:hover { background: var(--bg-hover); }
        
        .suggestion-btn { background:var(--bg-main); border:1px solid var(--border); border-radius:12px; padding:16px; display:flex; gap:12px; align-items:center; cursor:pointer; transition:0.2s; box-shadow:0 2px 8px rgba(0,0,0,0.02); }
        .suggestion-btn:hover { background:var(--bg-hover); transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,0.05); }
        .quick-btn { padding:10px 16px; border-radius:20px; border:1px solid var(--border); background:var(--bg-input); cursor:pointer; font-size:13px; color:var(--text-main); transition:0.2s; }
        
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        textarea::placeholder{color:var(--text-muted)}
        .dl-btn { opacity: 0; transition: opacity 0.2s ease, transform 0.2s ease; transform: translateY(10px); }
        .img-container:hover .dl-btn { opacity: 1; transform: translateY(0); }
        .avoid-break { page-break-inside: avoid !important; } 
        
        .nc p { margin-top: 0; margin-bottom: 12px; }
        .nc h1, .nc h2, .nc h3 { font-weight: 700; margin: 16px 0 8px; }
        .nc ul, .nc ol { padding-left: 24px; margin: 12px 0 16px; }
        .nc a { color: #6c47ff; text-decoration: none; }
        ::-webkit-scrollbar{width:6px; height:6px; display:none;}
        .chat-box::-webkit-scrollbar { display: block; }
        ::-webkit-scrollbar-thumb{background:var(--border);border-radius:10px}
      `}</style>
    </div>
  )
}

function MenuItem({icon,label,check,blue,onClick}) {
  return (
    <button onClick={onClick} style={{width:"100%",padding:"10px 16px",border:"none",background:"transparent",color:blue?"#4a9eff":check?"#4a9eff":"var(--text-main)",cursor:"pointer",display:"flex",alignItems:"center",gap:12,fontSize:14,textAlign:"left",fontFamily:"inherit"}}>
      <span style={{width:20,textAlign:"center",fontSize:15}}>{icon}</span>
      <span style={{flex:1}}>{label}</span>
      {check&&<span style={{color:"#4a9eff",fontSize:15}}>✓</span>}
    </button>
  )
}