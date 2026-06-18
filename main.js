const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path   = require('path')
const fs     = require('fs')
const http   = require('http')
const https  = require('https')
const { URL } = require('url')

app.setName('SendX')

// ── GOOGLE OAUTH CONFIG ──────────────────────────────────────
// Carrega credenciais de google-credentials.json (não versionado)
// Crie o arquivo seguindo google-credentials.example.json
const credPath = app.isPackaged
  ? path.join(process.resourcesPath, 'google-credentials.json')
  : path.join(__dirname, 'google-credentials.json')
const _creds = fs.existsSync(credPath) ? JSON.parse(fs.readFileSync(credPath, 'utf8')) : {}
const GOOGLE_CLIENT_ID     = _creds.client_id || ''
const GOOGLE_CLIENT_SECRET = _creds.client_secret || ''
const REDIRECT_URI         = 'http://localhost:3456/callback'
const SCOPES               = 'https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email'
// ──────────────────────────────────────────────────────────────

function getDataDir() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(__dirname, 'data')
}
function lerJSON(nome, padrao) {
  const f = path.join(getDataDir(), nome + '.json')
  try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch(e) { return padrao }
}
function salvarJSON(nome, dados) {
  const dir = getDataDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, nome + '.json'), JSON.stringify(dados, null, 2))
}

let win = null

function createWindow() {
  const dir = getDataDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  win = new BrowserWindow({
    width: 1300, height: 860,
    minWidth: 1100, minHeight: 700,
    title: 'SendX', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'logo.ico'),
    webPreferences: {
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      webSecurity: false,
      additionalArguments: ['--data-dir=' + getDataDir()]
    }
  })
  win.loadFile('index.html')
  win.once('ready-to-show', () => { win.show(); win.focus() })
  setTimeout(() => { if (win && !win.isVisible()) win.show() }, 4000)
  win.on('page-title-updated', e => e.preventDefault())
}

// ── IPC DADOS ────────────────────────────────────────────────
ipcMain.handle('dados:ler',    async (e, nome)        => lerJSON(nome, []))
ipcMain.handle('dados:salvar', async (e, nome, dados) => { salvarJSON(nome, dados); return { ok: true } })
ipcMain.handle('config:ler',   async (e, k, pad)      => { const c = lerJSON('config',{}); return c[k] !== undefined ? c[k] : pad })
ipcMain.handle('config:salvar',async (e, k, v)        => { const c = lerJSON('config',{}); c[k]=v; salvarJSON('config',c); return {ok:true} })

ipcMain.handle('salvar-csv', async (event, { conteudo, nomeArquivo }) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      defaultPath: nomeArquivo || 'lista.csv',
      filters: [{ name: 'Planilha CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { sucesso: false }
    fs.writeFileSync(filePath, conteudo, 'utf8')
    return { sucesso: true, caminho: filePath }
  } catch(e) { return { sucesso: false, erro: e.message } }
})

ipcMain.handle('abrir-csv', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Contatos', extensions: ['csv','txt'] }]
  })
  if (result.canceled) return null
  return { caminho: result.filePaths[0], conteudo: fs.readFileSync(result.filePaths[0], 'utf8') }
})

ipcMain.handle('salvar-pdf', async (event, { htmlContent, nomeArquivo }) => {
  try {
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      defaultPath: nomeArquivo || 'relatorio.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return { sucesso: false, motivo: 'cancelado' }
    const tmpFile = path.join(getDataDir(), '_tmp.html')
    fs.writeFileSync(tmpFile, htmlContent, 'utf8')
    const tmpWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } })
    await tmpWin.loadFile(tmpFile)
    await new Promise(r => setTimeout(r, 800))
    const pdfBuf = await tmpWin.webContents.printToPDF({
      printBackground: true, pageSize: 'A4',
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    })
    tmpWin.destroy()
    fs.writeFileSync(filePath, pdfBuf)
    try { fs.unlinkSync(tmpFile) } catch(e) {}
    return { sucesso: true, caminho: filePath }
  } catch(e) { return { sucesso: false, erro: e.message } }
})

// ── OAUTH2 GOOGLE ─────────────────────────────────────────────
ipcMain.handle('oauth:configurado', () => GOOGLE_CLIENT_ID !== 'SEU_CLIENT_ID_AQUI')

let oauthServer = null // guarda referência global do servidor

ipcMain.handle('oauth:iniciar', () => new Promise((resolve) => {
  // Fecha servidor anterior se ainda estiver aberto
  if (oauthServer) {
    try { oauthServer.close() } catch(e) {}
    oauthServer = null
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id',     GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri',  REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope',         SCOPES)
  authUrl.searchParams.set('access_type',   'offline')
  authUrl.searchParams.set('prompt',        'consent')

  let respondido = false

  const fecharServidor = () => {
    if (oauthServer) {
      try { oauthServer.close() } catch(e) {}
      oauthServer = null
    }
  }

  oauthServer = http.createServer(async (req, res) => {
    if (respondido) return
    const u = new URL(req.url, 'http://localhost:3456')
    if (u.pathname !== '/callback') { res.end(); return }
    respondido = true

    const code = u.searchParams.get('code')
    const erro = u.searchParams.get('error')

    if (erro || !code) {
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'})
      res.end(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;text-align:center;padding:80px">
        <h2 style="color:#e53e3e">❌ Login cancelado</h2><p style="color:#666;margin-top:8px">Pode fechar esta aba e tentar novamente no app.</p></body></html>`)
      fecharServidor()
      resolve({ sucesso: false, erro: 'Cancelado' })
      return
    }

    try {
      const tokens = await trocarCodigo(code)
      const perfil = await buscarPerfil(tokens.access_token)
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'})
      res.end(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;text-align:center;padding:80px">
        <h2 style="color:#48bb78">✅ Login realizado!</h2>
        <p style="color:#a0a0a0;margin-top:8px">Conta: <b style="color:#fff">${perfil.email}</b></p>
        <p style="color:#555;margin-top:16px">Pode fechar esta aba e voltar ao SendX.</p>
        </body></html>`)
      fecharServidor()
      resolve({ sucesso: true, email: perfil.email, nome: perfil.name, tokens })
    } catch(e) {
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'})
      res.end(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;text-align:center;padding:80px">
        <h2 style="color:#e53e3e">Erro: ${e.message}</h2></body></html>`)
      fecharServidor()
      resolve({ sucesso: false, erro: e.message })
    }
  })

  oauthServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Porta ainda ocupada — aguarda 1s e tenta fechar
      setTimeout(() => {
        fecharServidor()
        resolve({ sucesso: false, erro: 'Porta ocupada. Aguarde 2 segundos e tente novamente.' })
      }, 1000)
    } else {
      fecharServidor()
      resolve({ sucesso: false, erro: err.message })
    }
  })

  oauthServer.listen(3456, () => shell.openExternal(authUrl.toString()))

  // Timeout de 3 minutos
  setTimeout(() => {
    if (!respondido) {
      respondido = true
      fecharServidor()
      resolve({ sucesso: false, erro: 'Tempo esgotado. Tente novamente.' })
    }
  }, 180000)
}))

ipcMain.handle('oauth:renovar', async (e, refreshToken) => {
  try { return { sucesso: true, tokens: await renovarToken(refreshToken) } }
  catch(err) { return { sucesso: false, erro: err.message } }
})

function postHttps(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body)
    const req = https.request({ hostname, path, method:'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded', 'Content-Length': buf.length }
    }, res => {
      let d = ''; res.on('data', c => d += c)
      res.on('end', () => {
        try { const j = JSON.parse(d); if(j.error) reject(new Error(j.error_description||j.error)); else resolve(j) }
        catch(e) { reject(e) }
      })
    })
    req.on('error', reject); req.write(buf); req.end()
  })
}

function trocarCodigo(code) {
  return postHttps('oauth2.googleapis.com', '/token', new URLSearchParams({
    code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: REDIRECT_URI, grant_type: 'authorization_code'
  }).toString())
}

function renovarToken(refreshToken) {
  return postHttps('oauth2.googleapis.com', '/token', new URLSearchParams({
    refresh_token: refreshToken, client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token'
  }).toString())
}

function buscarPerfil(accessToken) {
  return new Promise((resolve, reject) => {
    https.get({ hostname:'www.googleapis.com', path:'/oauth2/v2/userinfo',
      headers:{ Authorization:`Bearer ${accessToken}` }
    }, res => {
      let d = ''; res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch(e) { reject(e) } })
    }).on('error', reject)
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
