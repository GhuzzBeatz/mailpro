function fmtData(d) {
  if (!d) return '—'
  const p = d.split('-'); return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : d
}

function agora() {
  const d = new Date()
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
}

function horaAgora() {
  return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())
}

function parsearCSV(texto) {
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const contatos = []
  for (const linha of linhas) {
    if (linha.startsWith('#') || linha.toLowerCase().startsWith('email')) continue
    const partes = linha.split(/[,;|\t]/).map(p => p.trim().replace(/^"|"$/g,''))
    const email = partes[0]
    if (!email || !validarEmail(email)) continue
    contatos.push({
      email: email.toLowerCase(),
      nome:    partes[1] || '',
      empresa: partes[2] || '',
      extra:   partes[3] || ''
    })
  }
  return contatos
}

function substituirVars(texto, contato) {
  return texto
    .replace(/\{nome\}/gi,    contato.nome    || '')
    .replace(/\{email\}/gi,   contato.email   || '')
    .replace(/\{empresa\}/gi, contato.empresa || '')
    .replace(/\{extra\}/gi,   contato.extra   || '')
}

function avisoModal(msg) {
  const o = document.createElement('div')
  o.className = 'modal-overlay'
  o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99999;display:flex;align-items:center;justify-content:center'
  o.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:14px;padding:28px 32px;max-width:380px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)">
    <div style="font-size:13px;color:var(--fg);margin-bottom:18px;line-height:1.6">${msg}</div>
    <button onclick="document.querySelectorAll('.modal-overlay').forEach(el=>el.remove())" style="padding:9px 24px;border:none;border-radius:8px;background:var(--primary);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">OK</button>
  </div>`
  document.body.appendChild(o)
}

function confirmar(msg, cb) {
  const o = document.createElement('div')
  o.className = 'modal-overlay'
  o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99999;display:flex;align-items:center;justify-content:center'
  o.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:14px;padding:28px 32px;max-width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)">
    <div style="font-size:24px;margin-bottom:10px">⚠️</div>
    <div style="font-size:13px;color:var(--fg);margin-bottom:18px;line-height:1.5">${msg}</div>
    <div style="display:flex;gap:10px;justify-content:center">
      <button id="cfnN" style="padding:9px 20px;border:1px solid var(--border2);border-radius:8px;background:transparent;color:var(--fg2);cursor:pointer;font-size:13px;font-family:inherit">Cancelar</button>
      <button id="cfnS" style="padding:9px 20px;border:none;border-radius:8px;background:var(--primary);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:inherit">Confirmar</button>
    </div>
  </div>`
  document.body.appendChild(o)
  const fechar = () => document.querySelectorAll('.modal-overlay').forEach(el => el.remove())
  o.querySelector('#cfnS').onclick = () => { fechar(); cb(true) }
  o.querySelector('#cfnN').onclick = () => { fechar(); cb(false) }
}

function aviso(tipo, msg) {
  const ok  = document.getElementById('avisoOk')
  const err = document.getElementById('avisoErro')
  if (tipo === 'ok') {
    if (err) err.style.display = 'none'
    if (ok)  { ok.textContent = msg; ok.style.display = 'block'; setTimeout(()=>ok.style.display='none',3500) }
  } else {
    if (ok) ok.style.display = 'none'
    if (err) { err.textContent = msg; err.style.display = 'block'; setTimeout(()=>err.style.display='none',4500) }
  }
}
