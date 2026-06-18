const { ipcRenderer } = require('electron')

async function lerDados(nome) {
  return await ipcRenderer.invoke('dados:ler', nome)
}

async function salvarDados(nome, dados) {
  return await ipcRenderer.invoke('dados:salvar', nome, dados)
}

async function getConfig(k, pad) {
  return await ipcRenderer.invoke('config:ler', k, pad)
}

async function setConfig(k, v) {
  return await ipcRenderer.invoke('config:salvar', k, v)
}

async function getSmtp() {
  const c = await lerDados('smtp_config')
  if (Array.isArray(c) || !c || !c.host) {
    return { host:'', port:587, ssl:false, user:'', senha:'', nomeRemetente:'MailPro GHZ' }
  }
  return c
}

async function setSmtp(dados) {
  return await salvarDados('smtp_config', dados)
}

async function getHistorico() {
  const h = await lerDados('historico')
  return Array.isArray(h) ? h : []
}

async function adicionarHistorico(campanha) {
  const h = await getHistorico()
  h.unshift(campanha)
  if (h.length > 100) h.pop()
  await salvarDados('historico', h)
}
