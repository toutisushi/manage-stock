import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

// ============================================================
// STYLES
// ============================================================
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500&display=swap');
  :root {
    --bg: #faf7f2; --surface: #ffffff; --surface2: #f3ede3;
    --border: #e0d5c5; --text: #2c2416; --text-muted: #8a7a65;
    --accent: #b5762a; --accent-light: #f0e0c5; --accent-dark: #8a5515;
    --danger: #c0392b; --danger-light: #fde8e6;
    --success: #27ae60; --success-light: #e8f5e8;
    --radius: 12px; --shadow: 0 2px 16px rgba(44,36,22,0.08);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  button { cursor: pointer; font-family: inherit; }
  input, select, textarea { font-family: inherit; }
  img { display: block; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
`

// ============================================================
// TYPES
// ============================================================
interface Product {
  id: string; name: string; cat: string; country: string; size: string
  color: string; price: string; qty: number; threshold: number
  material: string; desc: string; photo: string
}

interface HistoryEntry {
  type: string; productId: string; productName: string
  qty: number; note: string; date: string
}

interface Variant { size: string; color: string; qty: number }

type Route = { name: 'home' } | { name: 'product'; id: string }

const CATEGORIES = [
  { key: 'vêtements', label: '👘 Vêtements' },
  { key: 'décorations', label: '🏺 Décorations' },
  { key: 'meubles', label: '🪑 Meubles' },
]

function genId() {
  return 'P' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase()
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ============================================================
// STORAGE
// ============================================================
function loadProducts(): Product[] {
  try { return JSON.parse(localStorage.getItem('artisan_products') || '[]') } catch { return [] }
}
function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem('artisan_history') || '[]') } catch { return [] }
}

// ============================================================
// CONTEXT
// ============================================================
interface StockContextType {
  products: Product[]; history: HistoryEntry[]
  addProduct: (data: Omit<Product, 'id'>) => void
  updateProduct: (id: string, data: Partial<Product>) => void
  deleteProduct: (id: string) => void
  moveStock: (productId: string, type: string, qty: number, note: string) => void
  duplicateProduct: (id: string, variants: Variant[]) => void
  importData: (products: Product[], history: HistoryEntry[], mode: string) => void
  getUniqueValues: (field: string) => string[]
}

const StockContext = createContext<StockContextType | null>(null)

function StockProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState(loadProducts)
  const [history, setHistory] = useState(loadHistory)

  useEffect(() => { localStorage.setItem('artisan_products', JSON.stringify(products)) }, [products])
  useEffect(() => { localStorage.setItem('artisan_history', JSON.stringify(history)) }, [history])

  const addProduct = useCallback((data: Omit<Product, 'id'>) => {
    const id = genId()
    setProducts(prev => [...prev, { id, ...data }])
    if (data.qty > 0) setHistory(prev => [{ type: 'add', productId: id, productName: data.name, qty: data.qty, note: 'Stock initial', date: new Date().toISOString() }, ...prev])
  }, [])

  const updateProduct = useCallback((id: string, data: Partial<Product>) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== id) return p
      if (data.qty !== undefined && data.qty !== p.qty) {
        const diff = Math.abs(data.qty - p.qty)
        setHistory(h => [{ type: data.qty! > p.qty ? 'add' : 'remove', productId: id, productName: data.name || p.name, qty: diff, note: 'Modification manuelle', date: new Date().toISOString() }, ...h])
      }
      return { ...p, ...data }
    }))
  }, [])

  const deleteProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id))
  }, [])

  const moveStock = useCallback((productId: string, type: string, qty: number, note: string) => {
    setProducts(prev => prev.map(p => p.id !== productId ? p : { ...p, qty: type === 'add' ? p.qty + qty : p.qty - qty }))
    setProducts(prev => {
      const product = prev.find(p => p.id === productId)
      if (product) setHistory(h => [{ type, productId, productName: product.name, qty, note, date: new Date().toISOString() }, ...h])
      return prev
    })
  }, [])

  const duplicateProduct = useCallback((id: string, variants: Variant[]) => {
    setProducts(prev => {
      const source = prev.find(p => p.id === id)
      if (!source) return prev
      const newProds = variants.map(v => ({ ...source, id: genId(), size: v.size || source.size, color: v.color || source.color, qty: v.qty }))
      const newHist = newProds.filter(p => p.qty > 0).map(p => ({ type: 'add', productId: p.id, productName: p.name, qty: p.qty, note: 'Dupliqué depuis ' + source.name, date: new Date().toISOString() }))
      if (newHist.length) setHistory(h => [...newHist, ...h])
      return [...prev, ...newProds]
    })
  }, [])

  const importData = useCallback((incoming: Product[], incomingHistory: HistoryEntry[], mode: string) => {
    if (mode === 'replace') { setProducts(incoming); setHistory(incomingHistory) }
    else {
      setProducts(prev => { const ids = new Set(prev.map(p => p.id)); return [...prev, ...incoming.filter(p => !ids.has(p.id))] })
      setHistory(prev => { const keys = new Set(prev.map(h => h.date + '_' + h.productId)); return [...prev, ...incomingHistory.filter(h => !keys.has(h.date + '_' + h.productId))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) })
    }
  }, [])

  const getUniqueValues = useCallback((field: string): string[] => {
    const values = products.map(p => (p as unknown as Record<string, string>)[field]).filter(v => v && v.trim())
    return [...new Set(values)].sort()
  }, [products])

  return <StockContext.Provider value={{ products, history, addProduct, updateProduct, deleteProduct, moveStock, duplicateProduct, importData, getUniqueValues }}>{children}</StockContext.Provider>
}

function useStock() {
  const ctx = useContext(StockContext)
  if (!ctx) throw new Error('useStock must be used within StockProvider')
  return ctx
}

// ============================================================
// AUTOCOMPLETE INPUT
// ============================================================
function AutocompleteInput({ value, onChange, suggestions, placeholder }: { value: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase())

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input type="text" value={value} placeholder={placeholder} autoComplete="off"
        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', color: 'var(--text)', background: 'var(--surface)', outline: 'none' }}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <ul style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 50, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', listStyle: 'none', maxHeight: 200, overflowY: 'auto' }}>
          {filtered.slice(0, 6).map(s => (
            <li key={s} onMouseDown={() => { onChange(s); setOpen(false) }}
              style={{ padding: '9px 12px', fontSize: '0.88rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-light)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >{s}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ============================================================
// MODAL
// ============================================================
function Modal({ open, onClose, title, children, maxWidth = 500 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; maxWidth?: number }) {
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [open])
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.55)', backdropFilter: 'blur(4px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0', flexShrink: 0 }}>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.3rem', fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: '50%', width: 32, height: 32, fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px 24px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}

// ============================================================
// PRODUCT FORM
// ============================================================
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }
const labelStyle: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }
const inputStyle: React.CSSProperties = { padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '0.9rem', color: 'var(--text)', background: 'var(--surface)', outline: 'none', width: '100%' }

function ProductForm({ initial = {}, onSave, onCancel, submitLabel = 'Enregistrer' }: { initial?: Partial<Product>; onSave: (data: Omit<Product, 'id'>) => void; onCancel: () => void; submitLabel?: string }) {
  const { getUniqueValues } = useStock()
  const [name, setName] = useState(initial.name || '')
  const [cat, setCat] = useState(initial.cat || '')
  const [country, setCountry] = useState(initial.country || '')
  const [size, setSize] = useState(initial.size || '')
  const [color, setColor] = useState(initial.color || '')
  const [price, setPrice] = useState(initial.price || '')
  const [qty, setQty] = useState(String(initial.qty ?? 0))
  const [threshold, setThreshold] = useState(String(initial.threshold ?? 5))
  const [material, setMaterial] = useState(initial.material || '')
  const [desc, setDesc] = useState(initial.desc || '')
  const [photo, setPhoto] = useState(initial.photo || '')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPhoto(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = () => {
    if (!name.trim()) { setError('Le nom est obligatoire'); return }
    if (!cat) { setError('Veuillez choisir une catégorie'); return }
    setError('')
    onSave({ name: name.trim(), cat, country, size, color, price, qty: parseInt(qty) || 0, threshold: parseInt(threshold) || 5, material, desc, photo })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {error && <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 8 }}>⚠ {error}</div>}

      {/* Photo */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Photo</label>
        <div onClick={() => fileRef.current?.click()} style={{ width: '100%', height: 130, borderRadius: 10, overflow: 'hidden', background: 'var(--surface2)', border: '2px dashed var(--border)', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {photo ? <img src={photo} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} alt="" /> : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}><span style={{ fontSize: '2rem' }}>📷</span><small style={{ fontSize: '0.8rem' }}>Cliquez pour ajouter</small></div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
        {photo && <button onClick={() => setPhoto('')} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer', alignSelf: 'flex-start' }}>🗑 Supprimer la photo</button>}
      </div>

      <div style={fieldStyle}><label style={labelStyle}>Nom *</label><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Vase en terre cuite" /></div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Catégorie *</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCat(c.key)} style={{ padding: '7px 14px', borderRadius: 99, border: '1.5px solid', borderColor: cat === c.key ? 'var(--accent)' : 'var(--border)', background: cat === c.key ? 'var(--accent)' : 'var(--surface)', color: cat === c.key ? '#fff' : 'var(--text)', fontSize: '0.82rem', fontWeight: 500 }}>{c.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}><label style={labelStyle}>Pays</label><AutocompleteInput value={country} onChange={setCountry} suggestions={getUniqueValues('country')} placeholder="Ex: Maroc" /></div>
        <div style={fieldStyle}><label style={labelStyle}>Couleur</label><AutocompleteInput value={color} onChange={setColor} suggestions={getUniqueValues('color')} placeholder="Ex: Bleu" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}><label style={labelStyle}>Taille</label><AutocompleteInput value={size} onChange={setSize} suggestions={getUniqueValues('size')} placeholder="Ex: M" /></div>
        <div style={fieldStyle}><label style={labelStyle}>Matière</label><AutocompleteInput value={material} onChange={setMaterial} suggestions={getUniqueValues('material')} placeholder="Ex: Coton" /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}><label style={labelStyle}>Prix (€)</label><input style={inputStyle} type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
        <div style={fieldStyle}><label style={labelStyle}>Quantité</label><input style={inputStyle} type="number" min="0" value={qty} onChange={e => setQty(e.target.value)} /></div>
      </div>
      <div style={fieldStyle}><label style={labelStyle}>Seuil alerte</label><input style={inputStyle} type="number" min="0" value={threshold} onChange={e => setThreshold(e.target.value)} /></div>
      <div style={fieldStyle}><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, minHeight: 75, resize: 'vertical' }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description…" /></div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onCancel} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'transparent', fontSize: '0.88rem', fontWeight: 500 }}>Annuler</button>
        <button onClick={handleSubmit} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.88rem', fontWeight: 600 }}>{submitLabel}</button>
      </div>
    </div>
  )
}

// ============================================================
// HOME SCREEN
// ============================================================
function HomeScreen({ navigate }: { navigate: (r: Route) => void }) {
  const { products, history, addProduct, importData } = useStock()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importPreview, setImportPreview] = useState<{ products: Product[]; history: HistoryEntry[]; filename: string } | null>(null)
  const [importError, setImportError] = useState('')

  const totalStock = products.reduce((s, p) => s + p.qty, 0)
  const lowStock = products.filter(p => p.qty <= (p.threshold || 5) && p.qty > 0).length

  const filtered = products
    .filter(p => filter === 'all' || p.cat === filter)
    .filter(p => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q) || p.material.toLowerCase().includes(q)
    })

const handleExport = async () => {
  try {
    const clean = products.map(({ photo: _p, ...rest }) => rest)
    const json = JSON.stringify({ version: 1, exportDate: new Date().toISOString(), products: clean, history }, null, 2)
    const filename = 'artisanat-stock-' + new Date().toISOString().slice(0, 10) + '.json'

    // Essaie d'abord le téléchargement web classique
    try {
      const bytes = new TextEncoder().encode(json)
      let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b))
      const a = document.createElement('a')
      a.href = 'data:application/json;base64,' + btoa(bin)
      a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
    } catch {
      // Sur Android WebView : utilise le partage natif
      if (navigator.share) {
        const file = new File([json], filename, { type: 'application/json' })
        await navigator.share({ files: [file], title: 'Export Stock' })
      } else {
        // Fallback : copie dans le presse-papier
        await navigator.clipboard.writeText(json)
        alert('✓ Données copiées dans le presse-papier')
      }
    }
  } catch (e) {
    alert('Erreur export : ' + String(e))
  }
}

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(''); setImportPreview(null)
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string)
        const prods: Product[] = Array.isArray(parsed) ? parsed : parsed.products || []
        const hist: HistoryEntry[] = parsed.history || []
        if (prods.some((p: Product) => !p.id || !p.name)) { setImportError('Fichier invalide'); return }
        setImportPreview({ products: prods, history: hist, filename: file.name })
      } catch { setImportError('Fichier JSON invalide') }
    }
    reader.readAsText(file); e.target.value = ''
  }

  const confirmImport = (mode: string) => {
    if (!importPreview) return
    if (mode === 'replace' && !confirm('Remplacer tous les produits existants ?')) return
    importData(importPreview.products, importPreview.history, mode)
    setShowImport(false); setImportPreview(null)
  }

  const catEmoji: Record<string, string> = { vêtements: '👘', décorations: '🏺', meubles: '🪑' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: '#2c2416', color: '#faf7f2', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.4rem', fontWeight: 700 }}>Artisanat <span style={{ color: '#c9935a' }}>&</span> Déco</h1>
          <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.5, marginTop: 2 }}>Gestion de stock</p>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[['Produits', products.length, false], ['En stock', totalStock, false], ...(lowStock > 0 ? [['Stock bas', lowStock, true]] : [])].map(([lbl, num, danger]) => (
            <div key={String(lbl)} style={{ textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: '1.2rem', fontWeight: 700, color: danger ? 'var(--danger)' : '#c9935a' }}>{String(num)}</span>
              <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.8px', opacity: 0.55 }}>{String(lbl)}</span>
            </div>
          ))}
        </div>
      </header>

      <div style={{ padding: 20, flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '0 14px', marginBottom: 14 }}>
          <span style={{ marginRight: 8, opacity: 0.6 }}>🔍</span>
          <input type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.9rem', color: 'var(--text)', padding: '11px 0', outline: 'none' }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12 }}>✕</button>}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {[{ key: 'all', label: 'Tous' }, ...CATEGORIES].map(c => (
            <button key={c.key} onClick={() => setFilter(c.key)} style={{ padding: '7px 16px', borderRadius: 99, border: '1.5px solid', borderColor: filter === c.key ? 'var(--accent)' : 'var(--border)', background: filter === c.key ? 'var(--accent)' : 'var(--surface)', color: filter === c.key ? '#fff' : 'var(--text)', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap' }}>{c.label}</button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>+ Ajouter</button>
          <button onClick={() => setShowHistory(true)} style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'transparent', fontSize: '0.85rem', fontWeight: 500 }}>🕐 Historique</button>
          <button onClick={handleExport} style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'transparent', fontSize: '0.85rem' }} title="Exporter">📤</button>
          <button onClick={() => { setShowImport(true); setImportPreview(null); setImportError('') }} style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'transparent', fontSize: '0.85rem' }} title="Importer">📥</button>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '80px 20px', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: 60 }}>📦</span>
            <p style={{ fontSize: '1rem' }}>Aucun produit trouvé</p>
            <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>+ Ajouter un produit</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {filtered.map(p => {
              const isLow = p.qty <= (p.threshold || 5)
              return (
                <div key={p.id} onClick={() => navigate({ name: 'product', id: p.id })} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', cursor: 'pointer', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: 170, background: 'var(--surface2)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.photo ? <img src={p.photo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}><span style={{ fontSize: 36 }}>🖼️</span><small style={{ fontSize: '0.75rem' }}>Pas de photo</small></div>}
                    <div style={{ position: 'absolute', top: 8, right: 8, borderRadius: 99, padding: '3px 10px', fontSize: '0.8rem', fontWeight: 700, color: '#fff', background: p.qty === 0 ? 'var(--danger)' : isLow ? '#f39c12' : 'var(--success)' }}>{p.qty}</div>
                  </div>
                  <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {p.cat && <span style={{ background: '#e8f4e8', color: '#27ae60', fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>{catEmoji[p.cat]} {p.cat}</span>}
                      {p.country && <span style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)', fontSize: '0.7rem', fontWeight: 500, padding: '2px 8px', borderRadius: 99 }}>🌍 {p.country}</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {p.size && <span>📐 {p.size}</span>}{p.color && <span>🎨 {p.color}</span>}
                      {p.material && <span>🧵 {p.material}</span>}{p.price && <span>💶 {parseFloat(p.price).toFixed(2)}€</span>}
                    </div>
                    {p.qty === 0 && <div style={{ fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>✗ Épuisé</div>}
                    {p.qty > 0 && isLow && <div style={{ fontSize: '0.72rem', color: '#f39c12', fontWeight: 600 }}>⚠ Stock bas</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal Add */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Nouveau produit">
        <ProductForm onSave={data => { addProduct(data); setShowAdd(false) }} onCancel={() => setShowAdd(false)} submitLabel="✓ Créer le produit" />
      </Modal>

      {/* Modal History */}
      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="🕐 Historique" maxWidth={620}>
        {history.length === 0 ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Aucun mouvement enregistré</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.84rem' }}>
                <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, background: h.type === 'add' ? 'var(--success-light)' : 'var(--danger-light)', color: h.type === 'add' ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>{h.type === 'add' ? '+ Entrée' : '− Sortie'}</span>
                <div style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{h.productName}</span><strong style={{ color: 'var(--accent)' }}> ×{h.qty}</strong>{h.note && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}> — {h.note}</span>}</div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(h.date)}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal Import */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="📥 Importer">
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '32px 20px', border: '2px dashed var(--border)', borderRadius: 12, cursor: 'pointer', marginBottom: 16, background: 'var(--bg)' }}>
          <span style={{ fontSize: '2rem' }}>📂</span>
          <strong style={{ fontSize: '0.9rem' }}>Choisir un fichier JSON</strong>
          <small style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Export artisanat-stock</small>
          <input type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
        </label>
        {importError && <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, fontSize: '0.84rem', marginBottom: 14 }}>⚠ {importError}</div>}
        {importPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, fontSize: '0.85rem', border: '1px solid var(--border)' }}>
              <strong>📄 {importPreview.filename}</strong><br />
              <span style={{ color: 'var(--text-muted)' }}>{importPreview.products.length} produit(s) · {importPreview.history.length} mouvement(s)</span>
            </div>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>Mode :</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['add', '➕', 'Ajouter', 'Fusionne avec l\'existant'], ['replace', '🔄', 'Remplacer', 'Efface tout']].map(([mode, icon, label, sub]) => (
                <button key={mode} onClick={() => confirmImport(mode)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: 14, borderRadius: 10, border: '2px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.4rem' }}>{icon}</span>
                  <strong style={{ fontSize: '0.85rem' }}>{label}</strong>
                  <small style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ============================================================
// PRODUCT SCREEN
// ============================================================
function ProductScreen({ id, navigate }: { id: string; navigate: (r: Route) => void }) {
  const { products, updateProduct, deleteProduct, moveStock, duplicateProduct } = useStock()
  const product = products.find(p => p.id === id)
  const [showEdit, setShowEdit] = useState(false)
  const [showMovement, setShowMovement] = useState(false)
  const [showBarcode, setShowBarcode] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)
  const [movQty, setMovQty] = useState('1')
  const [movNote, setMovNote] = useState('')
  const [variants, setVariants] = useState<Variant[]>([{ size: '', color: '', qty: 1 }])

  if (!product) return <div style={{ padding: 40, textAlign: 'center' }}>Produit introuvable <button onClick={() => navigate({ name: 'home' })}>← Retour</button></div>

  const isLow = product.qty <= (product.threshold || 5)
  const catEmoji: Record<string, string> = { vêtements: '👘', décorations: '🏺', meubles: '🪑' }

  const handleMovement = (type: string) => {
    const q = parseInt(movQty) || 1
    if (type === 'remove' && product.qty < q) { alert('Stock insuffisant'); return }
    moveStock(id, type, q, movNote)
    setShowMovement(false); setMovQty('1'); setMovNote('')
  }

  const handleDuplicate = () => {
    const valid = variants.filter(v => v.size || v.color)
    if (!valid.length) { alert('Ajoutez au moins une variante'); return }
    duplicateProduct(id, valid)
    setShowDuplicate(false); navigate({ name: 'home' })
  }

  const handleDelete = () => {
    if (!confirm('Supprimer "' + product.name + '" ?')) return
    deleteProduct(id); navigate({ name: 'home' })
  }

  const BarcodeVisual = () => {
    const bars = []
    for (let i = 0; i < product.id.length * 3; i++) {
      const w = ((product.id.charCodeAt(i % product.id.length) * (i + 1)) % 3) + 1
      bars.push(<div key={i} style={{ width: w, background: i % 2 === 0 ? '#2c2416' : 'transparent', flexShrink: 0, height: 60 }} />)
    }
    return (
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', height: 60, gap: 1 }}>{bars}</div>
        <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{product.id}</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ background: '#2c2416', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => navigate({ name: 'home' })} style={{ background: 'rgba(250,247,242,0.1)', border: 'none', color: '#faf7f2', padding: '8px 16px', borderRadius: 8, fontSize: '0.88rem', fontWeight: 500 }}>← Retour</button>
        <button onClick={handleDelete} style={{ background: 'none', border: '1.5px solid rgba(192,57,43,0.5)', color: '#e88', padding: '7px 14px', borderRadius: 8, fontSize: '0.82rem' }}>🗑️ Supprimer</button>
      </div>

      {product.photo
        ? <img src={product.photo} style={{ width: '100%', height: 240, objectFit: 'cover' }} alt="" />
        : <div style={{ width: '100%', height: 200, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 60 }}>🖼️</span></div>
      }

      <div style={{ padding: 20, maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.6rem', fontWeight: 700, flex: 1 }}>{product.name}</h1>
          <div style={{ borderRadius: 10, padding: '10px 14px', textAlign: 'center', minWidth: 70, background: product.qty === 0 ? 'var(--danger-light)' : isLow ? '#fef9e7' : 'var(--success-light)', border: '1.5px solid', borderColor: product.qty === 0 ? 'var(--danger)' : isLow ? '#f39c12' : 'var(--success)' }}>
            <span style={{ display: 'block', fontSize: '1.8rem', fontWeight: 800 }}>{product.qty}</span>
            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>en stock</span>
          </div>
        </div>
        {product.qty === 0 && <div style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.85rem', marginBottom: 12 }}>✗ Épuisé</div>}
        {product.qty > 0 && isLow && <div style={{ color: '#f39c12', fontWeight: 600, fontSize: '0.85rem', marginBottom: 12 }}>⚠ Stock bas — seuil : {product.threshold}</div>}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 16px', margin: '16px 0' }}>
          {[['Catégorie', product.cat ? catEmoji[product.cat] + ' ' + product.cat : ''], ['Pays', product.country ? '🌍 ' + product.country : ''], ['Taille', product.size ? '📐 ' + product.size : ''], ['Couleur', product.color ? '🎨 ' + product.color : ''], ['Matière', product.material ? '🧵 ' + product.material : ''], ['Prix', product.price ? '💶 ' + parseFloat(product.price).toFixed(2) + ' €' : ''], ['Référence', product.id]].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem', gap: 12 }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
              <span style={{ fontWeight: 500, textAlign: 'right', fontFamily: label === 'Référence' ? 'monospace' : 'inherit', fontSize: label === 'Référence' ? '0.78rem' : 'inherit' }}>{value}</span>
            </div>
          ))}
          {product.desc && <div style={{ padding: '10px 0', fontSize: '0.88rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{product.desc}</div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '20px 0' }}>
          {[['var(--accent)', '±', 'Mouvement', () => setShowMovement(true)], ['#5b4db5', '▦', 'Code-barres', () => setShowBarcode(true)], ['#2980b9', '✏️', 'Modifier', () => setShowEdit(true)], ['#16a085', '⧉', 'Dupliquer', () => { setVariants([{ size: product.size || '', color: product.color || '', qty: 1 }]); setShowDuplicate(true) }]].map(([bg, icon, label, action]) => (
            <button key={String(label)} onClick={action as () => void} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 16, borderRadius: 12, border: 'none', color: '#fff', background: String(bg) }}>
              <span style={{ fontSize: '1.5rem' }}>{String(icon)}</span>
              <small style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{String(label)}</small>
            </button>
          ))}
        </div>
      </div>

      {/* Modal Edit */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="✏️ Modifier">
        <ProductForm initial={product} onSave={data => { updateProduct(id, data); setShowEdit(false) }} onCancel={() => setShowEdit(false)} submitLabel="✓ Enregistrer" />
      </Modal>

      {/* Modal Movement */}
      <Modal open={showMovement} onClose={() => setShowMovement(false)} title="± Mouvement de stock" maxWidth={400}>
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 14 }}>{product.name}</p>
        <div style={fieldStyle}><label style={labelStyle}>Quantité</label><input style={inputStyle} type="number" min="1" value={movQty} onChange={e => setMovQty(e.target.value)} /></div>
        <div style={fieldStyle}><label style={labelStyle}>Note</label><input style={inputStyle} value={movNote} onChange={e => setMovNote(e.target.value)} placeholder="Raison…" /></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={() => setShowMovement(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', fontSize: '0.85rem' }}>Annuler</button>
          <button onClick={() => handleMovement('add')} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--success)', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>+ Entrée</button>
          <button onClick={() => handleMovement('remove')} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>− Sortie</button>
        </div>
      </Modal>

      {/* Modal Barcode */}
      <Modal open={showBarcode} onClose={() => setShowBarcode(false)} title="▦ Code-barres" maxWidth={380}>
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 14 }}>{product.name}</p>
        <BarcodeVisual />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={() => setShowBarcode(false)} style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', fontSize: '0.85rem' }}>Fermer</button>
        </div>
      </Modal>

      {/* Modal Duplicate */}
      <Modal open={showDuplicate} onClose={() => setShowDuplicate(false)} title="⧉ Dupliquer">
        <p style={{ color: 'var(--text-muted)', marginBottom: 14 }}>Copie de : <strong>{product.name}</strong></p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 65px 28px', gap: 6, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
          <span>Taille</span><span>Couleur</span><span>Qté</span><span></span>
        </div>
        {variants.map((v, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 65px 28px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input style={inputStyle} value={v.size} onChange={e => { const nv = [...variants]; nv[i].size = e.target.value; setVariants(nv) }} placeholder="Taille" />
            <input style={inputStyle} value={v.color} onChange={e => { const nv = [...variants]; nv[i].color = e.target.value; setVariants(nv) }} placeholder="Couleur" />
            <input style={{ ...inputStyle, width: 65 }} type="number" value={v.qty} onChange={e => { const nv = [...variants]; nv[i].qty = parseInt(e.target.value) || 0; setVariants(nv) }} />
            {variants.length > 1 && <button onClick={() => setVariants(variants.filter((_, j) => j !== i))} style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: 'none', borderRadius: 7, width: 28, height: 32, cursor: 'pointer' }}>×</button>}
          </div>
        ))}
        <button onClick={() => setVariants([...variants, { size: '', color: '', qty: 1 }])} style={{ background: 'none', border: '1.5px dashed var(--border)', borderRadius: 8, width: '100%', padding: 8, fontSize: '0.83rem', color: 'var(--text-muted)', cursor: 'pointer', margin: '6px 0 12px' }}>+ Ajouter une variante</button>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setShowDuplicate(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', fontSize: '0.85rem' }}>Annuler</button>
          <button onClick={handleDuplicate} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>✓ Créer les variantes</button>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' })

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = globalStyles
    document.head.appendChild(style)
    return () => { document.head.removeChild(style) }
  }, [])

  return (
    <StockProvider>
      {route.name === 'home' && <HomeScreen navigate={setRoute} />}
      {route.name === 'product' && <ProductScreen id={route.id} navigate={setRoute} />}
    </StockProvider>
  )
}
