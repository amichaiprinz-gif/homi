'use client'

import { useState, useRef, useEffect } from 'react'

interface ShoppingItem {
  text: string
  quantity: string | null
}

interface Props {
  onClose: () => void
  items: ShoppingItem[]
}

/**
 * Static bookmarklet — saved once in the browser, never changes between purchases.
 *
 * What it does when clicked on rami-levy.co.il:
 *   1. Reads the session UUID from the URL hash (#hb_session=...)
 *   2. Fetches the item list from HomeBase
 *   3. Searches RL for up to 8 candidates per item (runs inside RL — no Cloudflare block)
 *   4. POSTs candidates to HomeBase for Claude AI matching
 *   5. Shows an in-page overlay with the AI-matched preview
 *   6. On user confirmation, adds the matched product IDs to the RL cart
 *
 * All Hebrew strings are Unicode-escaped to avoid BiDi copy-paste issues.
 */
const BOOKMARKLET = `javascript:(async function(){var HB='https://fantastic-waddle-coral.vercel.app';var m=location.hash.match(/hb_session=([0-9a-f-]{36})/i);if(!m)return alert('HomeBase: \u05E4\u05EA\u05D7 \u05DE\u05D4\u05D0\u05E4\u05DC\u05D9\u05E7\u05E6\u05D9\u05D4 \u05E7\u05D5\u05D3\u05DD');var sid=m[1];var ov=document.createElement('div');ov.id='hbov';ov.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.65);z-index:2147483647;display:flex;align-items:center;justify-content:center';var crd=document.createElement('div');crd.style.cssText='background:#fff;border-radius:16px;padding:24px;max-width:420px;width:90%;max-height:85vh;overflow-y:auto;direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:14px;color:#111';ov.appendChild(crd);document.body.appendChild(ov);function ui(h){crd.innerHTML=h;}function spin(msg){ui('<p style="text-align:center;padding:12px;color:#6b7280">'+msg+'</p>');}var rl=JSON.parse(localStorage.getItem('ramilevy')||'{}');var tok=(rl.authuser&&rl.authuser.user&&rl.authuser.user.token)||'';var store=String((rl.authuser&&rl.authuser.user&&rl.authuser.user.store_id)||'331');if(!tok){ui('<p style="color:#dc2626;text-align:center;padding:12px">\u05D4\u05EA\u05D7\u05D1\u05E8 \u05DC\u05E8\u05DE\u05D9 \u05DC\u05D5\u05D9 \u05E7\u05D5\u05D3\u05DD</p>');return;}spin('\u05DE\u05D0\u05EA\u05D7\u05DC...');var hbf=document.createElement('iframe');hbf.id='hbframe';hbf.src=HB+'/shopping/match-frame?sid='+sid;hbf.style.cssText='position:fixed;bottom:72px;right:16px;width:220px;height:64px;border:none;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.25);z-index:2147483646';document.body.appendChild(hbf);var popup={postMessage:function(d,o){try{if(hbf.contentWindow)hbf.contentWindow.postMessage(d,o);}catch(ex){}}};var matched;try{matched=await new Promise(function(resolve,reject){var tmr=setTimeout(function(){reject(new Error('timeout'));},90000);var phase='waiting_items';function cleanup(){clearTimeout(tmr);window.removeEventListener('message',handler);}async function handler(e){if(e.origin!==HB||!e.data)return;if(e.data.type==='hb_items'&&phase==='waiting_items'){phase='searching';try{var items=e.data.items||[];if(!items.length){cleanup();reject(new Error('\u05D0\u05D9\u05DF \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD'));return;}var cands={};for(var i=0;i<items.length;i++){spin('\uD83D\uDD0D \u05DE\u05D7\u05E4\u05E9 '+(i+1)+'/'+items.length+': '+items[i].text);try{var sr=await fetch('/api/search?q='+encodeURIComponent(items[i].text)+'&store='+store+'&size=8',{headers:{'ecomtoken':tok}}).then(function(x){return x.json();}).catch(function(){return{data:[]};});cands[items[i].text]=((sr&&sr.data)||[]).slice(0,8).map(function(p){return{id:p.id,name:p.name,price:(p.price&&p.price.price)||null,brand:(p.gs&&p.gs.BrandName)||null,content:(p.gs&&p.gs.Net_Content&&p.gs.Net_Content.text)||null};});}catch(e2){cands[items[i].text]=[];}if(i<items.length-1)await new Promise(function(r){setTimeout(r,300);});}phase='waiting_matched';spin('Claude \u05DE\u05EA\u05D0\u05D9\u05DD \u05DE\u05D5\u05E6\u05E8\u05D9\u05DD...');popup.postMessage({type:'hb_candidates',candidates:cands},HB);}catch(se){cleanup();reject(se);}}if(e.data.type==='hb_matched'&&phase==='waiting_matched'){cleanup();resolve(e.data.items);}if(e.data.type==='hb_error'){cleanup();reject(new Error(e.data.message));}}window.addEventListener('message',handler);});}catch(e){if(hbf&&hbf.parentNode)hbf.remove();ui('<p style="color:#dc2626;padding:12px">\u05E9\u05D2\u05D9\u05D0\u05D4: '+e.message+'</p>');return;}if(hbf&&hbf.parentNode)hbf.remove();var actv=matched.filter(function(x){return x.status!=='not_found'&&x.rlProductId;});window.__hbActv=actv.slice();window.hbRemove=function(id){window.__hbActv=window.__hbActv.filter(function(x){return x.rlProductId!==id;});var row=document.getElementById('hbr'+id);if(row)row.remove();var btn=document.getElementById('hba');if(btn){if(window.__hbActv.length===0){btn.disabled=true;btn.style.opacity='0.5';btn.textContent='\u05D0\u05D9\u05DF \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD';}else{btn.textContent='\u05D4\u05D5\u05E1\u05E3 '+window.__hbActv.length+' \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD \u05DC\u05E1\u05DC';}}};var h='<div style="font-weight:700;font-size:15px;margin-bottom:2px">\uD83D\uDED2 \u05EA\u05E6\u05D5\u05D2\u05D4 \u05DE\u05E7\u05D3\u05D9\u05DE\u05D4 ('+actv.length+'/'+matched.length+')</div><div style="font-size:11px;color:#9ca3af;margin-bottom:10px">\u05DC\u05D7\u05E5 \u2715 \u05DC\u05D4\u05E1\u05E8\u05EA \u05E4\u05E8\u05D9\u05D8</div>';matched.forEach(function(x){var c=x.status==='matched'?'#16a34a':x.status==='substituted'?'#d97706':'#dc2626';var ic=x.status==='matched'?'\u2713':x.status==='substituted'?'\u26A0':'\u2717';var isAct=x.status!=='not_found'&&x.rlProductId;var rmBtn=isAct?'<button onclick="window.hbRemove('+x.rlProductId+')" style="border:none;background:none;cursor:pointer;color:#d1d5db;font-size:16px;padding:0 0 0 6px;flex-shrink:0;line-height:1" title="\u05D4\u05E1\u05E8">\u2715</button>':'';h+='<div id="hbr'+x.rlProductId+'" style="padding:7px 0;border-bottom:1px solid #f3f4f6;display:flex;gap:6px;align-items:flex-start"><span style="color:'+c+';font-weight:700;min-width:14px;flex-shrink:0;margin-top:1px">'+ic+'</span><div style="flex:1;min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(x.rlProductName||x.itemText)+'</div>'+(x.note?'<div style="font-size:11px;color:#9ca3af;margin-top:2px">'+x.note+'</div>':'')+'</div>'+(x.rlProductPrice?'<span style="font-size:12px;color:#9ca3af;white-space:nowrap;flex-shrink:0">\u20AA'+x.rlProductPrice+'</span>':'')+rmBtn+'</div>';});var tot=matched.reduce(function(s,x){return s+(x.rlProductPrice||0);},0);if(tot>0)h+='<div style="margin-top:10px;font-weight:700">\u05E1\u05D4"\u05DB: \u20AA'+tot.toFixed(2)+'</div>';h+='<div style="display:flex;gap:8px;margin-top:14px"><button id="hbc" style="padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;cursor:pointer;font-size:14px">\u05D1\u05D9\u05D8\u05D5\u05DC</button><button id="hba" style="flex:1;padding:10px;border:none;border-radius:8px;background:#f59e0b;color:#fff;font-weight:700;cursor:pointer;font-size:14px">\u05D4\u05D5\u05E1\u05E3 '+actv.length+' \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD \u05DC\u05E1\u05DC</button></div>';ui(h);document.getElementById('hbc').onclick=function(){var f=document.getElementById('hbframe');if(f)f.remove();ov.remove();};document.getElementById('hba').onclick=async function(){var toAdd=window.__hbActv||[];if(!toAdd.length)return;spin('\u05DE\u05D5\u05E1\u05D9\u05E3 \u05DC\u05E1\u05DC...');var ok=0,fail=0;var itms={};for(var j=0;j<toAdd.length;j++){itms[String(toAdd[j].rlProductId)]=Math.max(1,Math.round(Number(toAdd[j].quantity||1))).toFixed(2);}var d=new Date();d.setDate(d.getDate()+1);var sa=d.toISOString().split('T')[0]+'T00:00:00.000Z';var at=localStorage.getItem('auth._token.local')||'';var hdrs={'Content-Type':'application/json;charset=UTF-8','accept':'application/json, text/plain, */*','locale':'he','ecomtoken':tok};if(at)hdrs['authorization']=at;try{var res=await fetch('/api/v2/cart',{method:'POST',credentials:'include',headers:hdrs,body:JSON.stringify({store:store,isClub:0,supplyAt:sa,items:itms,meta:null})});if(res.ok){ok=toAdd.length;}else{fail=toAdd.length;var errTxt=await res.text().catch(function(){return'';});console.error('[HB] cart fail',res.status,errTxt);}}catch(e){fail=toAdd.length;console.error('[HB] cart err',e);}ui('<div style="text-align:center;padding:12px"><div style="font-size:40px">'+(fail===0?'\u2705':'\u26A0\uFE0F')+'</div><p style="font-weight:700;margin:10px 0">\u05E0\u05D5\u05E1\u05E4\u05D5 '+ok+(fail?' | \u05E0\u05DB\u05E9\u05DC\u05D5 '+fail:'')+'</p>'+(fail>0?'<p style="font-size:11px;color:#6b7280">\u05E6\u05E4\u05D4 \u05D1\u05E7\u05D5\u05E0\u05E1\u05D5\u05DC \u05DC\u05E4\u05E8\u05D8\u05D9\u05DD</p>':'')+'<button onclick="document.getElementById(&quot;hbov&quot;).remove()" style="padding:8px 20px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;font-size:14px">\u05E1\u05D2\u05D5\u05E8</button></div>');};})();`

export default function CartBuilderModal({ onClose, items }: Props) {
  const [phase, setPhase] = useState<'idle' | 'creating' | 'ready'>('idle')
  const [showSetup, setShowSetup] = useState(false)
  const [bmCopied, setBmCopied] = useState(false)
  const [error, setError] = useState('')
  const bmLinkRef = useRef<HTMLAnchorElement>(null)

  const pendingCount = items.filter(i => i.text.trim()).length

  // React blocks javascript: hrefs — set directly on the DOM element
  useEffect(() => {
    if (bmLinkRef.current) {
      bmLinkRef.current.setAttribute('href', BOOKMARKLET)
    }
  }, [showSetup])

  async function buildCart() {
    setError('')
    setPhase('creating')
    try {
      const res = await fetch('/api/shopping/build-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.filter(i => i.text.trim()) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      // Open RL in a new tab with the session hash
      window.open(data.rlUrl, '_blank', 'noopener')
      setPhase('ready')
    } catch (e) {
      setError(String(e))
      setPhase('idle')
    }
  }

  function copyBookmarklet() {
    navigator.clipboard.writeText(BOOKMARKLET).then(() => {
      setBmCopied(true)
      setTimeout(() => setBmCopied(false), 3000)
    }).catch(() => {})
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 backdrop-blur-sm pb-16"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800 flex-shrink-0">
          <div>
            <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">בנה סל ברמי לוי</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{pendingCount} פריטים · AI matching</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Items preview */}
          <div className="bg-zinc-50 dark:bg-zinc-800 rounded-2xl divide-y divide-zinc-100 dark:divide-zinc-700 overflow-hidden">
            {items.filter(i => i.text.trim()).map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-sm text-zinc-400">🛒</span>
                <span className="flex-1 text-sm text-zinc-800 dark:text-zinc-200">{item.text}</span>
                {item.quantity && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">×{item.quantity}</span>
                )}
              </div>
            ))}
          </div>

          {/* Phase: ready — instructions */}
          {phase === 'ready' && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl px-4 py-4 space-y-2">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">רמי לוי נפתח!</p>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                עבור לטאב של רמי לוי — אם התקנת את תוסף Chrome, התצוגה המקדימה תופיע אוטומטית.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                אין תוסף? לחץ על הסימניה <strong>HomeBase 🛒</strong> בסרגל הסימניות.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {/* How it works (only in idle) */}
          {phase === 'idle' && (
            <div className="space-y-2.5">
              {[
                { n: 1, text: 'לחץ "פתח רמי לוי" — הדף ייפתח בטאב חדש' },
                { n: 2, text: 'עבור לטאב רמי לוי — תוסף Chrome יפעיל הכל אוטומטית' },
                { n: 3, text: 'אשר בתצוגה המקדימה — הפריטים יתווספו לסל' },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{n}</span>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Extension + bookmarklet setup */}
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-right"
              onClick={() => setShowSetup(v => !v)}
            >
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {showSetup ? '▲' : '▼'} הגדרה (פעם אחת בלבד)
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">נדרש לשלב 2</span>
            </button>

            {showSetup && (
              <div className="px-4 pb-4 pt-1 space-y-4 border-t border-zinc-100 dark:border-zinc-800">

                {/* Chrome Extension — recommended */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    ✨ תוסף Chrome (מומלץ — עובד אוטומטית)
                  </p>
                  <ol className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1 leading-relaxed list-decimal list-inside">
                    <li>פתח Chrome → <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">chrome://extensions</code></li>
                    <li>הפעל &quot;מצב מפתח&quot; (פינה ימנית עליונה)</li>
                    <li>לחץ &quot;טען תוסף לא ארוז&quot; → בחר את תיקיית <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">extension/</code> בפרויקט</li>
                  </ol>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    אחרי ההתקנה — כל לחיצה על &quot;פתח רמי לוי&quot; תפעיל את הכל אוטומטית.
                  </p>
                </div>

                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    או: סימניה (Chrome דסקטופ בלבד)
                  </p>

                  <a
                    ref={bmLinkRef}
                    href="#"
                    className="inline-block bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold px-4 py-2 rounded-xl select-none cursor-grab"
                    onClick={e => e.preventDefault()}
                    title="גרור לסרגל הסימניות"
                  >
                    🛒 HomeBase — גרור לסרגל
                  </a>

                  <div className="relative">
                    <pre
                      dir="ltr"
                      className="bg-zinc-900 text-emerald-400 text-[9px] rounded-xl p-3 overflow-x-auto font-mono whitespace-pre-wrap break-all max-h-20 overflow-y-auto select-all leading-relaxed"
                    >
                      {BOOKMARKLET}
                    </pre>
                    <button
                      onClick={copyBookmarklet}
                      className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors ${
                        bmCopied ? 'bg-emerald-500 text-white' : 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                      }`}
                    >
                      {bmCopied ? '✓' : 'העתק'}
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex-shrink-0"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          {phase === 'ready' ? (
            <button
              onClick={onClose}
              className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-semibold py-3.5 rounded-2xl transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              סגור
            </button>
          ) : (
            <button
              onClick={buildCart}
              disabled={phase === 'creating' || pendingCount === 0}
              className="flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold py-3.5 rounded-2xl transition-colors"
            >
              {phase === 'creating' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <span>יוצר סשן...</span>
                </>
              ) : (
                <>
                  <span>🛒</span>
                  <span>פתח רמי לוי עם {pendingCount} פריטים</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
