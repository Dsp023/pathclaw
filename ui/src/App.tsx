import { useState, useEffect } from 'react'

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

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function App() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanPath, setScanPath] = useState("")

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setStatus(data))
      .catch(err => console.error("Failed to fetch status:", err))
  }, [])

  const runScan = async () => {
    setIsScanning(true)
    setScanResult(null)
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: scanPath || undefined, deep: false })
      })
      const data = await res.json()
      if (data.success) {
        setScanResult(data.result)
      } else {
        alert("Scan failed: " + data.error)
      }
    } catch (err) {
      alert("Scan failed: " + String(err))
    }
    setIsScanning(false)
  }

  return (
    <div className="dashboard-container">
      <header>
        <div className="logo">
          🦅 <span>PathClaw Dashboard</span>
        </div>
        {status && <div style={{ color: 'var(--text-muted)' }}>{status.hostname} • {status.platform}</div>}
      </header>

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
          <div className="card-header">
            <span>CPU</span>
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 500, marginTop: '1rem', color: 'var(--text-muted)' }}>
            {status ? status.cpu : 'Loading...'}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span>Last Scan Status</span>
          </div>
          <div className={`card-value ${scanResult && scanResult.totalJunkSize > 0 ? 'warning' : 'success'}`}>
            {scanResult ? (scanResult.totalJunkSize > 0 ? 'Action Needed' : 'Clean') : 'Unknown'}
          </div>
          <div style={{ marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {scanResult ? `${formatBytes(scanResult.totalJunkSize)} recoverable` : 'Run a scan to analyze health'}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Scanner</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Directory to scan (default: Home directory)" 
            value={scanPath}
            onChange={(e) => setScanPath(e.target.value)}
            style={{ 
              flex: 1, 
              padding: '0.75rem 1rem', 
              background: 'rgba(0,0,0,0.2)', 
              border: '1px solid var(--border)', 
              borderRadius: '8px', 
              color: 'white',
              fontFamily: 'inherit'
            }}
          />
          <button className="primary" onClick={runScan} disabled={isScanning}>
            {isScanning ? <><div className="spinner"></div> Scanning...</> : '🔍 Run Full Scan'}
          </button>
        </div>
      </div>

      {scanResult && (
        <div className="scan-results">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Scan Results</h2>
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

          {scanResult.largeFiles.length > 0 && (
            <>
              <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Top Large Files</h3>
              <table className="results-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {scanResult.largeFiles.slice(0, 10).map((f: any, i: number) => (
                    <tr key={i}>
                      <td><span className="path-text">{f.path}</span></td>
                      <td style={{ fontWeight: 500, color: 'var(--warning)' }}>{formatBytes(f.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

    </div>
  )
}

export default App
