import { useState, useEffect, useRef } from 'react'

// --- Interfaces ---
interface SystemStatus {
  platform: string;
  hostname: string;
  ram: { total: number; free: number; used: number; usedPct: number };
  cpu: string;
}

interface ScanResult {
  totalSize: number;
  totalJunkSize: number;
  junkFiles: any[];
  tempFiles: any[];
  duplicates: any[][];
  largeFiles: any[];
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

// --- Utils ---
function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'scanner' | 'dupes' | 'chat'>('overview')

  // Status State
  const [status, setStatus] = useState<SystemStatus | null>(null)
  
  // Scan & Dupes State
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanPath, setScanPath] = useState("")
  const [selectedDupes, setSelectedDupes] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'ai', text: 'Hello! I am PathClaw. What can I help you optimize today?' }
  ])
  const [chatInput, setChatInput] = useState("")
  const [isChatting, setIsChatting] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Fetch Status
  const fetchStatus = () => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setStatus(data))
      .catch(err => console.error(err))
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000) // Poll every 5s
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // --- Handlers ---
  const handleOptimize = async (action: 'ram' | 'temp' | 'cache') => {
    if (!confirm(`Are you sure you want to clear the ${action}?`)) return
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      const data = await res.json()
      if (data.success) {
        alert(`${action.toUpperCase()} cleared successfully!`)
        fetchStatus()
      } else alert("Failed: " + data.error)
    } catch (err) {
      alert("Error: " + String(err))
    }
  }

  const runScan = async () => {
    setIsScanning(true)
    setScanResult(null)
    setSelectedDupes(new Set())
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: scanPath || undefined, deep: false })
      })
      const data = await res.json()
      if (data.success) setScanResult(data.result)
      else alert("Scan failed: " + data.error)
    } catch (err) {
      alert("Scan failed: " + String(err))
    }
    setIsScanning(false)
  }

  const toggleDupe = (path: string) => {
    const newSet = new Set(selectedDupes)
    if (newSet.has(path)) newSet.delete(path)
    else newSet.add(path)
    setSelectedDupes(newSet)
  }

  const deleteDupes = async () => {
    if (selectedDupes.size === 0) return
    if (!confirm(`Delete ${selectedDupes.size} duplicate files? This cannot be undone.`)) return
    
    setIsDeleting(true)
    try {
      const res = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: Array.from(selectedDupes) })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Successfully freed ${formatBytes(data.freed)}!`)
        setSelectedDupes(new Set())
        runScan() // Refresh scan
      } else alert("Failed: " + data.error)
    } catch (err) {
      alert("Error: " + String(err))
    }
    setIsDeleting(false)
  }

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || isChatting) return

    const msg = chatInput.trim()
    setChatInput("")
    setChatMessages(prev => [...prev, { role: 'user', text: msg }])
    setIsChatting(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: msg })
      })
      const data = await res.json()
      if (data.success) {
        setChatMessages(prev => [...prev, { role: 'ai', text: data.response }])
      } else {
        setChatMessages(prev => [...prev, { role: 'ai', text: "❌ Error: " + data.error }])
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'ai', text: "❌ Connection error." }])
    }
    setIsChatting(false)
  }

  // --- Renderers ---
  return (
    <div className="dashboard-container">
      <header>
        <div className="logo">
          🦅 <span>PathClaw Dashboard</span>
        </div>
        {status && <div style={{ color: 'var(--text-muted)' }}>{status.hostname} • {status.platform}</div>}
      </header>

      <div className="tabs">
        <button className={`tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
        <button className={`tab ${activeTab === 'scanner' ? 'active' : ''}`} onClick={() => setActiveTab('scanner')}>Scanner</button>
        <button className={`tab ${activeTab === 'dupes' ? 'active' : ''}`} onClick={() => setActiveTab('dupes')}>Duplicates</button>
        <button className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>AI Chat</button>
      </div>

      {activeTab === 'overview' && (
        <div className="animation-fadeIn">
          <div className="grid">
            <div className="card">
              <div className="card-header">
                <span>RAM Usage</span>
                <span>{status ? `${formatBytes(status.ram.used)} / ${formatBytes(status.ram.total)}` : 'Loading...'}</span>
              </div>
              <div className={`card-value ${status && status.ram.usedPct > 85 ? 'danger' : 'success'}`}>
                {status ? `${status.ram.usedPct}%` : '--'}
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: status ? `${status.ram.usedPct}%` : '0%',
                    background: status && status.ram.usedPct > 85 ? 'var(--danger)' : 'var(--primary)'
                  }}
                ></div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span>CPU</span></div>
              <div style={{ fontSize: '1.2rem', fontWeight: 500, marginTop: '1rem', color: 'var(--text-muted)' }}>
                {status ? status.cpu : 'Loading...'}
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Quick Actions</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: '1.5rem' }}>
              Free up system resources instantly.
            </p>
            <div className="btn-group">
              <button className="primary" onClick={() => handleOptimize('ram')}>⚡ Clear RAM Standby List</button>
              <button onClick={() => handleOptimize('cache')}>🧹 Flush DNS Cache</button>
              <button onClick={() => handleOptimize('temp')}>🗑️ Empty Temp Folders</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'scanner' && (
        <div className="animation-fadeIn">
          <div className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>System Scanner</h2>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <input 
                type="text" 
                placeholder="Directory to scan (default: Home directory)" 
                value={scanPath}
                onChange={(e) => setScanPath(e.target.value)}
              />
              <button className="primary" onClick={runScan} disabled={isScanning}>
                {isScanning ? <><div className="spinner"></div> Scanning...</> : '🔍 Run Full Scan'}
              </button>
            </div>
          </div>

          {scanResult && (
            <div className="scan-results">
              <div className="grid">
                <div className="card">
                  <div className="card-header">Junk & Temp Files</div>
                  <div className="card-value">{scanResult.junkFiles.length + scanResult.tempFiles.length}</div>
                </div>
                <div className="card">
                  <div className="card-header">Duplicate Groups</div>
                  <div className="card-value">{scanResult.duplicates.length}</div>
                </div>
                <div className="card">
                  <div className="card-header">Recoverable Space</div>
                  <div className="card-value warning">{formatBytes(scanResult.totalJunkSize)}</div>
                </div>
              </div>
              <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>
                Go to the <b>Duplicates</b> tab to safely clean up duplicate files.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'dupes' && (
        <div className="animation-fadeIn">
          {!scanResult ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <h2 style={{ marginBottom: '1rem' }}>No Scan Results</h2>
              <p style={{ color: 'var(--text-muted)' }}>Please run a scan in the Scanner tab first to find duplicates.</p>
              <button className="primary" style={{ margin: '1.5rem auto' }} onClick={() => setActiveTab('scanner')}>Go to Scanner</button>
            </div>
          ) : scanResult.duplicates.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <h2>✅ No Duplicates Found</h2>
              <p style={{ color: 'var(--text-muted)' }}>Your file system is clean!</p>
            </div>
          ) : (
            <div>
              <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>Review Duplicates</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Select the copies you want to permanently delete.
                  </p>
                </div>
                <button className="danger" disabled={selectedDupes.size === 0 || isDeleting} onClick={deleteDupes}>
                  {isDeleting ? 'Deleting...' : `🗑️ Delete ${selectedDupes.size} Selected`}
                </button>
              </div>

              {scanResult.duplicates.map((group, i) => (
                <div key={i} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    Group {i + 1} — {formatBytes(group[0].size)} per file
                  </div>
                  <table className="results-table" style={{ marginTop: 0 }}>
                    <tbody>
                      {group.map((f, j) => (
                        <tr key={j} style={{ background: selectedDupes.has(f.path) ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                          <td style={{ width: '40px' }}>
                            <input 
                              type="checkbox" 
                              checked={selectedDupes.has(f.path)}
                              onChange={() => toggleDupe(f.path)}
                              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                          </td>
                          <td><span className="path-text" style={{ color: selectedDupes.has(f.path) ? 'var(--danger)' : 'var(--text)' }}>{f.path}</span></td>
                          <td style={{ width: '150px', color: 'var(--text-muted)' }}>
                            {new Date(f.modified).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="animation-fadeIn">
          <div className="chat-window">
            <div className="chat-messages">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>
                    {msg.role === 'ai' ? '🦅 PathClaw' : 'You'}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                </div>
              ))}
              {isChatting && (
                <div className="message ai" style={{ opacity: 0.5 }}>
                  <div className="spinner"></div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input" onSubmit={sendChat}>
              <input 
                type="text" 
                placeholder="Ask PathClaw to 'Clear RAM' or 'Find large files in Downloads'..." 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={isChatting}
              />
              <button type="submit" className="primary" disabled={!chatInput.trim() || isChatting}>Send</button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

export default App
