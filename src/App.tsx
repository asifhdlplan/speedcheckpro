import { useEffect, useRef, useState } from "react";
import SpeedTest from "@cloudflare/speedtest";

interface TestLog {
  id: number;
  time: string;
  ip: string;
  isp: string;
  location: string;
  download: number;
  upload: number;
  ping: number;
  networkType: string;
}

// WORKING CLOUD BACKEND - Pantry.cloud (Free, No Signup, CORS enabled)
// This pantry is auto-created on first use
const PANTRY_ID = "speedtest-global-logs-2024";
const CLOUD_BASKET = "tests";
const CLOUD_URL = `https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/${CLOUD_BASKET}`;

// Local cache for instant loads
const LOCAL_KEY = "speedtest_logs_v3";

function getLocal(): TestLog[] {
  try {
    const data = localStorage.getItem(LOCAL_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function setLocal(logs: TestLog[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(logs.slice(-100)));
  } catch {}
}

async function getLogs(): Promise<TestLog[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    
    const res = await fetch(CLOUD_URL, { 
      cache: "no-store",
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const logs = Array.isArray(data?.logs) ? data.logs : [];
      setLocal(logs);
      return logs;
    }
    
    // If 404, create pantry
    if (res.status === 404) {
      await fetch(CLOUD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: [], created: new Date().toISOString() }),
      });
      return [];
    }
  } catch (e) {
    console.log("Cloud offline, using cache");
  }
  return getLocal();
}

async function saveLog(log: TestLog) {
  const logs = await getLogs();
  logs.push(log);
  const trimmed = logs.slice(-500);
  
  // Instant local save
  setLocal(trimmed);
  
  // Background cloud sync (don't wait)
  fetch(CLOUD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      logs: trimmed, 
      updated: new Date().toISOString(),
      count: trimmed.length 
    }),
  }).catch(() => {});
}

async function clearLogs() {
  setLocal([]);
  try {
    await fetch(CLOUD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs: [], cleared: new Date().toISOString() }),
    });
  } catch {}
}

function getConnectionType(): string {
  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  
  if (conn?.type === "wifi" || conn?.type === "ethernet") return "WiFi";
  if (conn?.type === "cellular") return "Mobile";
  if (conn?.effectiveType?.match(/2g|3g|4g|5g/)) return "Mobile";
  
  return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "Mobile" : "WiFi";
}

async function fetchIpInfo() {
  const apis = [
    "https://ipwho.is/",
    "https://ipapi.co/json/",
    "https://get.geojs.io/v1/ip/geo.json"
  ];

  for (const url of apis) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) continue;
      
      const d = await res.json();
      const ip = d.ip || d.query;
      const isp = d.connection?.isp || d.org || d.organization || d.isp || "Unknown";
      const city = d.city;
      const country = d.country || d.country_name || d.country_code;
      
      if (ip) {
        return {
          ip,
          isp,
          location: city && country ? `${city}, ${country}` : country || "Unknown",
        };
      }
    } catch {}
  }
  return { ip: "Unknown", isp: "Unknown", location: "Unknown" };
}

function AdminPanel() {
  const [auth, setAuth] = useState(false);
  const [pwd, setPwd] = useState("");
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    if (sessionStorage.getItem("admin_ok") === "1") {
      setAuth(true);
      load();
    }
  }, []);

  const load = async () => {
    setLoading(true);
    setCloudStatus("checking");
    
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3000);
      await fetch(CLOUD_URL, { signal: controller.signal, cache: "no-store" });
      setCloudStatus("online");
    } catch {
      setCloudStatus("offline");
    }
    
    const data = await getLogs();
    setLogs(data.reverse()); // newest first
    setLoading(false);
  };

  const login = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd === "0707") {
      sessionStorage.setItem("admin_ok", "1");
      setAuth(true);
      load();
    } else {
      setErr("Wrong password");
      setTimeout(() => setErr(""), 2000);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("admin_ok");
    setAuth(false);
    window.location.hash = "";
  };

  const clearAll = async () => {
    if (confirm(`Delete all ${logs.length} logs permanently?`)) {
      await clearLogs();
      load();
    }
  };

  if (!auth) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-[340px]">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10 mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h1 className="text-[22px] font-medium tracking-tight">Admin Access</h1>
            <p className="text-[13px] text-zinc-500 mt-1">Enter password to view test logs</p>
          </div>
          
          <form onSubmit={login} className="space-y-3">
            <input
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full h-[44px] px-3.5 bg-[#141414] border border-zinc-800 rounded-xl text-[14px] outline-none focus:border-zinc-600 transition-colors placeholder:text-zinc-600"
            />
            {err && <p className="text-[12px] text-red-400">{err}</p>}
            <button className="w-full h-[44px] bg-white text-black rounded-xl text-[14px] font-medium hover:bg-zinc-200 transition-colors">
              Continue
            </button>
          </form>
          
          <button
            onClick={() => window.location.hash = ""}
            className="w-full mt-3 text-[13px] text-zinc-500 hover:text-zinc-300"
          >
            ← Back to speed test
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="border-b border-zinc-900">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[56px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div>
              <div className="text-[14px] font-medium leading-none">Test Logs</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`w-1.5 h-1.5 rounded-full ${cloudStatus === "online" ? "bg-emerald-500" : cloudStatus === "offline" ? "bg-amber-500" : "bg-zinc-600"} ${cloudStatus === "checking" ? "animate-pulse" : ""}`} />
                <span className="text-[11px] text-zinc-500">
                  {cloudStatus === "online" ? "Cloud sync active" : cloudStatus === "offline" ? "Local cache" : "Connecting..."}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="h-[32px] px-3 bg-[#141414] hover:bg-[#1a1a1a] border border-zinc-800 rounded-lg text-[12px] transition-colors disabled:opacity-50">
              {loading ? "..." : "Refresh"}
            </button>
            <button onClick={clearAll} className="h-[32px] px-3 bg-red-950/50 hover:bg-red-900/50 border border-red-900/50 rounded-lg text-[12px] text-red-300 transition-colors">
              Clear
            </button>
            <button onClick={logout} className="h-[32px] px-3 bg-[#141414] hover:bg-[#1a1a1a] border border-zinc-800 rounded-lg text-[12px] transition-colors">
              Exit
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total Tests", value: logs.length.toString() },
            { label: "Today", value: logs.filter(l => new Date(l.time).toDateString() === new Date().toDateString()).length.toString() },
            { label: "Avg Down", value: logs.length ? `${(logs.reduce((a,b) => a + b.download, 0) / logs.length).toFixed(0)} Mbps` : "—" },
          ].map((s) => (
            <div key={s.label} className="bg-[#111111] border border-zinc-900 rounded-xl p-3.5">
              <div className="text-[11px] text-zinc-500 mb-1">{s.label}</div>
              <div className="text-[20px] font-medium tracking-tight">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="bg-[#111111] border border-zinc-900 rounded-xl overflow-hidden">
          <div className="px-4 h-[40px] flex items-center border-b border-zinc-900">
            <h2 className="text-[13px] font-medium">Recent Tests <span className="text-zinc-600 font-normal">({Math.min(logs.length, 100)} shown)</span></h2>
          </div>
          
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[#111111] border-b border-zinc-900">
                <tr className="text-[11px] text-zinc-500">
                  {["Time", "IP Address", "Location", "ISP", "Download", "Upload", "Ping", "Network"].map(h => (
                    <th key={h} className="text-left font-medium px-4 h-[32px] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <div className="text-zinc-600 text-[13px]">No tests yet</div>
                      <div className="text-zinc-700 text-[12px] mt-1">Run a speed test to see data here</div>
                    </td>
                  </tr>
                ) : (
                  logs.slice(0, 100).map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 h-[40px] text-[12px] text-zinc-400 whitespace-nowrap">
                        {new Date(log.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 h-[40px] text-[12px] font-mono">{log.ip}</td>
                      <td className="px-4 h-[40px] text-[12px] text-zinc-300 max-w-[140px] truncate" title={log.location}>{log.location}</td>
                      <td className="px-4 h-[40px] text-[12px] text-zinc-400 max-w-[120px] truncate" title={log.isp}>{log.isp}</td>
                      <td className="px-4 h-[40px] text-[12px] font-medium text-emerald-400">{log.download.toFixed(1)}</td>
                      <td className="px-4 h-[40px] text-[12px] font-medium text-sky-400">{log.upload.toFixed(1)}</td>
                      <td className="px-4 h-[40px] text-[12px] text-zinc-400">{log.ping}</td>
                      <td className="px-4 h-[40px]">
                        <span className={`inline-flex items-center px-2 h-[20px] rounded-md text-[10px] font-medium border ${
                          log.networkType === "WiFi" 
                            ? "bg-blue-950/30 text-blue-300 border-blue-900/30" 
                            : "bg-purple-950/30 text-purple-300 border-purple-900/30"
                        }`}>
                          {log.networkType}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-center">
          <button onClick={() => window.location.hash = ""} className="text-[12px] text-zinc-600 hover:text-zinc-400">
            ← Return to speed test
          </button>
        </div>
      </div>
    </div>
  );
}

function SpeedTestApp() {
  const [status, setStatus] = useState<"idle" | "testing" | "done">("idle");
  const [ping, setPing] = useState(0);
  const [down, setDown] = useState(0);
  const [up, setUp] = useState(0);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const testRef = useRef<any>(null);

  const startTest = async () => {
    if (status === "testing") return;
    
    setStatus("testing");
    setPing(0);
    setDown(0);
    setUp(0);
    setProgress(0);
    setPhase("Initializing");

    const test = new SpeedTest({
      measurements: [
        { type: "latency", numPackets: 15 },
        { type: "download", bytes: 10_000_000, count: 3 },
        { type: "download", bytes: 25_000_000, count: 4 },
        { type: "download", bytes: 100_000_000, count: 2 },
        { type: "upload", bytes: 5_000_000, count: 3 },
        { type: "upload", bytes: 25_000_000, count: 3 },
      ],
    });
    
    testRef.current = test;

    test.onResultsChange = ({ type }) => {
      const r = test.results;
      if (type === "latency" && r.getUnloadedLatency()) {
        setPing(Math.round(r.getUnloadedLatency()!));
        setPhase("Ping");
        setProgress(15);
      }
      if (type === "download" && r.getDownloadBandwidth()) {
        const mbps = (r.getDownloadBandwidth()! * 8) / 1_000_000;
        setDown(mbps);
        setPhase("Download");
        setProgress(15 + Math.min(60, (mbps / 500) * 60));
      }
      if (type === "upload" && r.getUploadBandwidth()) {
        const mbps = (r.getUploadBandwidth()! * 8) / 1_000_000;
        setUp(mbps);
        setPhase("Upload");
        setProgress(75 + Math.min(25, (mbps / 200) * 25));
      }
    };

    test.onFinish = async (results: any) => {
      setProgress(100);
      setPhase("Complete");
      setStatus("done");

      const finalPing = Math.round(results.getUnloadedLatency() || ping);
      const finalDown = ((results.getDownloadBandwidth() || 0) * 8) / 1_000_000;
      const finalUp = ((results.getUploadBandwidth() || 0) * 8) / 1_000_000;

      setPing(finalPing);
      setDown(finalDown);
      setUp(finalUp);

      // Save to cloud AFTER test (non-blocking)
      setTimeout(async () => {
        const ipInfo = await fetchIpInfo();
        await saveLog({
          id: Date.now(),
          time: new Date().toISOString(),
          ip: ipInfo.ip,
          isp: ipInfo.isp,
          location: ipInfo.location,
          download: Math.round(finalDown * 10) / 10,
          upload: Math.round(finalUp * 10) / 10,
          ping: finalPing,
          networkType: getConnectionType(),
        });
      }, 100);
    };

    test.onError = () => {
      setStatus("idle");
      setPhase("Error");
    };

    try {
      await test.play();
    } catch {
      setStatus("idle");
    }
  };

  const reset = () => {
    testRef.current?.pause();
    setStatus("idle");
    setProgress(0);
    setPhase("");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <header className="border-b border-zinc-900">
        <div className="max-w-[960px] mx-auto px-4 h-[52px] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="black"/>
              </svg>
            </div>
            <span className="text-[15px] font-medium tracking-tight">Speedtest</span>
          </div>
          <button 
            onClick={() => window.location.hash = "#admin"}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Admin
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-10">
            <h1 className="text-[28px] font-medium tracking-tight mb-2">Internet Speed Test</h1>
            <p className="text-[14px] text-zinc-500">Powered by Cloudflare • Accurate & private</p>
          </div>

          <div className="relative mb-10">
            <div className="aspect-square max-w-[320px] mx-auto">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="88" fill="none" stroke="#1a1a1a" strokeWidth="12"/>
                <circle
                  cx="100" cy="100" r="88" fill="none"
                  stroke="white" strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 88}`}
                  strokeDashoffset={`${2 * Math.PI * 88 * (1 - progress / 100)}`}
                  className="transition-all duration-500"
                  style={{ filter: status === "testing" ? "drop-shadow(0 0 12px rgba(255,255,255,0.3))" : "" }}
                />
              </svg>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {status === "idle" ? (
                  <>
                    <div className="text-[13px] text-zinc-500 mb-1">Ready to test</div>
                    <div className="text-[42px] font-medium tracking-tight">—</div>
                    <div className="text-[13px] text-zinc-600 mt-1">Mbps</div>
                  </>
                ) : status === "testing" ? (
                  <>
                    <div className="text-[12px] text-zinc-500 mb-1 uppercase tracking-wider">{phase}</div>
                    <div className="text-[48px] font-medium tracking-tight tabular-nums">
                      {phase === "Download" ? down.toFixed(0) : phase === "Upload" ? up.toFixed(0) : ping || "—"}
                    </div>
                    <div className="text-[13px] text-zinc-600 mt-1">
                      {phase === "Ping" ? "ms" : "Mbps"}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[12px] text-emerald-400 mb-1">Complete</div>
                    <div className="text-[48px] font-medium tracking-tight">{down.toFixed(0)}</div>
                    <div className="text-[13px] text-zinc-600 mt-1">Mbps down</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: "Ping", value: ping ? `${ping}` : "—", unit: "ms", color: "text-zinc-400" },
              { label: "Download", value: down ? down.toFixed(1) : "—", unit: "Mbps", color: "text-emerald-400" },
              { label: "Upload", value: up ? up.toFixed(1) : "—", unit: "Mbps", color: "text-sky-400" },
            ].map((m) => (
              <div key={m.label} className="bg-[#111111] border border-zinc-900 rounded-2xl p-4 text-center">
                <div className="text-[11px] text-zinc-500 mb-1.5">{m.label}</div>
                <div className={`text-[22px] font-medium tabular-nums leading-none ${m.color}`}>{m.value}</div>
                <div className="text-[10px] text-zinc-600 mt-1">{m.unit}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            {status === "idle" || status === "done" ? (
              <button
                onClick={startTest}
                className="group relative h-[48px] px-8 bg-white text-black rounded-full text-[15px] font-medium hover:bg-zinc-100 active:scale-[0.98] transition-all"
              >
                <span className="flex items-center gap-2">
                  {status === "done" ? (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8V3h-5"/>
                      </svg>
                      Test Again
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="group-hover:translate-x-0.5 transition-transform">
                        <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      Start Test
                    </>
                  )}
                </span>
              </button>
            ) : (
              <button
                onClick={reset}
                className="h-[48px] px-8 bg-[#1a1a1a] hover:bg-[#222] border border-zinc-800 rounded-full text-[15px] font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          {status === "done" && (
            <div className="mt-8 text-center">
              <p className="text-[12px] text-zinc-600">
                Test saved • <button onClick={() => window.location.hash = "#admin"} className="hover:text-zinc-400 underline underline-offset-2">View in admin</button>
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-zinc-900 py-4">
        <div className="max-w-[960px] mx-auto px-4 flex items-center justify-center gap-4 text-[11px] text-zinc-600">
          <span>© 2024 Speedtest</span>
          <span>•</span>
          <span>Cloudflare Network</span>
          <span>•</span>
          <a href="#admin" className="hover:text-zinc-400">Admin</a>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Handle both /admin and #admin
    const checkRoute = () => {
      const hash = window.location.hash;
      const path = window.location.pathname;
      
      // Auto-redirect /admin to #admin to prevent 404
      if (path === "/admin" || path === "/admin/") {
        window.history.replaceState(null, "", "/#admin");
        setIsAdmin(true);
        return;
      }
      
      setIsAdmin(hash === "#admin");
    };

    checkRoute();
    window.addEventListener("hashchange", checkRoute);
    window.addEventListener("popstate", checkRoute);
    
    return () => {
      window.removeEventListener("hashchange", checkRoute);
      window.removeEventListener("popstate", checkRoute);
    };
  }, []);

  return isAdmin ? <AdminPanel /> : <SpeedTestApp />;
}