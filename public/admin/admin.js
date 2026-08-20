/* ---------------- Estado ---------------- */
let adminPassword = null; // guardado só em memória desta aba, nunca em localStorage
let allSubmissions = [];
let allClients = [];

/* ---------------- Logo (para o PDF, igual ao formulário principal) ---------------- */
let logoDataUrl = null;
let logoAspectRatio = null;

function prepareLogoForPdf(){
  const img = document.getElementById('logoForPdf');
  const toDataUrl = () => {
    try{
      if(!img.naturalWidth) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      logoDataUrl = canvas.toDataURL('image/png');
      logoAspectRatio = img.naturalWidth / img.naturalHeight;
    }catch(e){
      logoDataUrl = null;
    }
  };
  if(img.complete && img.naturalWidth){
    toDataUrl();
  }else{
    img.addEventListener('load', toDataUrl);
  }
}

/* ---------------- Reconstrução do PDF (mesmo layout do formulário) ---------------- */
// A fonte padrão do PDF (Helvetica) não tem o glifo do "μ" grego (U+03BC) usado
// nos rótulos em tela — por isso ele saía quebrado/em branco no PDF. O "µ" (sinal
// de micro, U+00B5) faz parte do conjunto de caracteres suportado, então convertemos
// qualquer texto antes de desenhar no PDF.
function toPdfText(value){
  if(value === null || value === undefined) return value;
  return String(value).replace(/μ/g, '\u00B5');
}

function buildPdf(rows, codigo){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  let y = 54;

  if(logoDataUrl && logoAspectRatio){
    const logoH = 40;
    const logoW = logoH * logoAspectRatio;
    doc.addImage(logoDataUrl, 'PNG', marginX, 26, logoW, logoH);
    y = 26 + logoH + 24;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 40, 38);
  doc.text('Resultados do Ensaio de Proficiência', marginX, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(95, 107, 103);
  doc.text(`Código do participante: ${toPdfText(codigo)}`, marginX, y);
  y += 14;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, marginX, y);
  y += 22;

  const sections = [];
  let current = null;
  rows.slice(1).forEach(([sec, label, value]) => {
    const secName = toPdfText(sec);
    if (!current || current.name !== secName) {
      current = { name: secName, items: [] };
      sections.push(current);
    }
    current.items.push([toPdfText(label), value && String(value).trim() !== '' ? toPdfText(value) : '—']);
  });

  sections.forEach(sec => {
    if (y > 760) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(31, 111, 99);
    doc.text(sec.name, marginX, y);
    y += 8;

    doc.autoTable({
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Campo', 'Valor']],
      body: sec.items,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: [30, 42, 46], lineColor: [220, 225, 220] },
      headStyles: { fillColor: [31, 111, 99], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 244] },
      columnStyles: { 0: { cellWidth: 230 }, 1: { cellWidth: 'auto' } }
    });
    y = doc.lastAutoTable.finalY + 26;
  });

  return doc;
}

/* ---------------- XLSX ---------------- */
function buildXlsxWorkbook(rows, codigo, submission){
  const sections = [];
  let current = null;
  rows.slice(1).forEach(([sec, label, value]) => {
    if (!current || current.name !== sec) {
      current = { name: sec, items: [] };
      sections.push(current);
    }
    current.items.push([label, value && String(value).trim() !== '' ? value : '—']);
  });

  const aoa = [
    ['Código do participante', codigo],
    ['Cliente', submission.clientNome || submission.clientUsername || ''],
    ['Enviado em', fmtDate(submission.createdAt)],
    [],
    ['Seção', 'Campo', 'Valor']
  ];
  sections.forEach(sec => {
    sec.items.forEach(([label, value]) => {
      aoa.push([sec.name, label, value]);
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 30 }, { wch: 34 }, { wch: 24 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
  return wb;
}

/* ---------------- Modais ---------------- */
function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

/* ---------------- Copiar senha temporária ----------------
   O X no canto do modal é a única forma de fechar; o botão principal só copia.
   A senha também fica em cache neste navegador (localStorage) enquanto o cliente
   não faz o primeiro acesso, para exibir o botão "Copiar senha" na aba Clientes. */
async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
    return true;
  }catch(e){
    // fallback para navegadores sem permissão/Clipboard API
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    }catch(e2){
      return false;
    }
  }
}

function flashButtonCopied(btn, originalText){
  const prev = originalText !== undefined ? originalText : btn.textContent;
  btn.textContent = 'Copiado!';
  setTimeout(() => { btn.textContent = prev; }, 1600);
}

document.getElementById('copyTempPwBtn').addEventListener('click', async () => {
  const btn = document.getElementById('copyTempPwBtn');
  const value = document.getElementById('tempPwValue').textContent;
  const ok = await copyToClipboard(value);
  flashButtonCopied(btn, 'Copiar');
  if (!ok) alert('Não foi possível copiar automaticamente. Selecione a senha manualmente.');
});

const TEMP_PW_CACHE_KEY = 'admin_temp_pw_cache';

function getTempPwCache(){
  try{
    return JSON.parse(localStorage.getItem(TEMP_PW_CACHE_KEY) || '{}');
  }catch(e){ return {}; }
}
function setTempPwCache(username, password){
  const cache = getTempPwCache();
  cache[username] = password;
  localStorage.setItem(TEMP_PW_CACHE_KEY, JSON.stringify(cache));
}
function removeTempPwCache(username){
  const cache = getTempPwCache();
  delete cache[username];
  localStorage.setItem(TEMP_PW_CACHE_KEY, JSON.stringify(cache));
}

/* ---------------- Login ---------------- */
async function tryLogin(){
  const input = document.getElementById('passwordInput');
  const errorBox = document.getElementById('loginError');
  const pwd = input.value.trim();
  errorBox.textContent = '';

  if(!pwd){
    errorBox.textContent = 'Digite a senha.';
    return;
  }

  try{
    const resp = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await resp.json();
    if(!resp.ok || !data.ok){
      errorBox.textContent = data.error || 'Senha incorreta.';
      return;
    }
    adminPassword = pwd;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('panelScreen').style.display = 'block';
    loadSubmissions();
    loadClients();
  }catch(e){
    errorBox.textContent = 'Erro de conexão. Tente novamente.';
  }
}

document.getElementById('loginBtn').addEventListener('click', tryLogin);
document.getElementById('passwordInput').addEventListener('keydown', e => {
  if(e.key === 'Enter') tryLogin();
});

/* ---------------- Abas ---------------- */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

function fmtDate(iso){
  if(!iso) return '—';
  try{
    return new Date(iso).toLocaleString('pt-BR');
  }catch(e){ return '—'; }
}

/* =========================================================================
   ENVIOS
   ========================================================================= */
async function loadSubmissions(){
  try{
    const resp = await fetch('/api/admin/submissions', {
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if(!resp.ok || !data.ok){
      alert(data.error || 'Erro ao carregar os dados.');
      return;
    }
    allSubmissions = data.submissions || [];
    renderTable(allSubmissions);
  }catch(e){
    alert('Erro de conexão ao carregar os dados.');
  }
}

function renderTable(list){
  const tbody = document.getElementById('tableBody');
  const emptyState = document.getElementById('emptyState');
  const countLabel = document.getElementById('countLabel');

  tbody.innerHTML = '';
  countLabel.textContent = `${list.length} envio(s)`;

  if(!list.length){
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  list.forEach(sub => {
    const tr = document.createElement('tr');
    const razaoSocial = sub.clientNome || sub.clientUsername || '—';
    const tecnico = (sub.fields && sub.fields.tecnico_nome) || '—';
    const dataCalib = (sub.fields && sub.fields.data_calibracao) || '—';
    const cliente = sub.clientUsername || '—';

    tr.innerHTML = `
      <td class="codigo">${sub.codigo}</td>
      <td>${razaoSocial}</td>
      <td class="muted">${tecnico}</td>
      <td class="muted">${cliente}</td>
      <td class="muted">${dataCalib}</td>
      <td class="muted">${fmtDate(sub.createdAt)}</td>
      <td class="actions">
        <button class="view-btn" data-codigo="${sub.codigo}">Ver</button>
        <button class="pdf-btn" data-codigo="${sub.codigo}">PDF</button>
        <button class="xlsx-btn" data-codigo="${sub.codigo}">XLSX</button>
        <button class="del-btn" data-codigo="${sub.codigo}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.pdf-btn').forEach(btn => btn.addEventListener('click', () => downloadPdfFor(btn)));
  tbody.querySelectorAll('.xlsx-btn').forEach(btn => btn.addEventListener('click', () => downloadXlsxFor(btn)));
  tbody.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => viewSubmission(btn)));
  tbody.querySelectorAll('.del-btn').forEach(btn => btn.addEventListener('click', () => deleteSubmission(btn)));
}

async function fetchSubmission(codigo){
  const resp = await fetch(`/api/admin/submissions/${encodeURIComponent(codigo)}`, {
    headers: { 'x-admin-password': adminPassword }
  });
  const data = await resp.json();
  if(!resp.ok || !data.ok) throw new Error(data.error || 'Erro ao buscar os dados desse envio.');
  return data.submission;
}

async function downloadPdfFor(btn){
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  try{
    const submission = await fetchSubmission(codigo);
    const rows = submission.rows || [];
    const doc = buildPdf(rows, codigo);
    doc.save(`resultados_${codigo.replace(/\s+/g,'-')}.pdf`);
  }catch(e){
    alert(e.message || 'Erro de conexão ao gerar o PDF.');
  }finally{
    btn.disabled = false;
    btn.textContent = 'PDF';
  }
}

async function downloadXlsxFor(btn){
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  try{
    const submission = await fetchSubmission(codigo);
    const rows = submission.rows || [];
    const wb = buildXlsxWorkbook(rows, codigo, submission);
    XLSX.writeFile(wb, `resultados_${codigo.replace(/\s+/g,'-')}.xlsx`);
  }catch(e){
    alert(e.message || 'Erro de conexão ao gerar o XLSX.');
  }finally{
    btn.disabled = false;
    btn.textContent = 'XLSX';
  }
}

async function viewSubmission(btn){
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Carregando...';
  try{
    const submission = await fetchSubmission(codigo);
    const rows = submission.rows || [];

    const sections = [];
    let current = null;
    rows.slice(1).forEach(([sec, label, value]) => {
      if (!current || current.name !== sec) {
        current = { name: sec, items: [] };
        sections.push(current);
      }
      current.items.push([label, value]);
    });

    document.getElementById('viewTitle').textContent = `Envio — ${codigo}`;
    const cliente = submission.clientNome || submission.clientUsername || '—';
    document.getElementById('viewSub').textContent = `Cliente: ${cliente} · Enviado em: ${fmtDate(submission.createdAt)}`;

    const content = document.getElementById('viewContent');
    content.innerHTML = sections.map(sec => `
      <div class="detail-section">
        <h4>${sec.name}</h4>
        <table class="detail-table">
          ${sec.items.map(([label, value]) => `
            <tr><td>${label}</td><td>${value && String(value).trim() !== '' ? value : '—'}</td></tr>
          `).join('')}
        </table>
      </div>
    `).join('');

    openModal('viewModal');
  }catch(e){
    alert(e.message || 'Erro de conexão ao carregar o envio.');
  }finally{
    btn.disabled = false;
    btn.textContent = 'Ver';
  }
}

async function deleteSubmission(btn){
  const codigo = btn.dataset.codigo;
  if(!confirm(`Excluir o envio "${codigo}"? Essa ação não pode ser desfeita.`)) return;

  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  try{
    const resp = await fetch(`/api/admin/submissions/${encodeURIComponent(codigo)}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if(!resp.ok || !data.ok){
      alert(data.error || 'Erro ao excluir o envio.');
      btn.disabled = false;
      btn.textContent = 'Excluir';
      return;
    }
    allSubmissions = allSubmissions.filter(s => s.codigo !== codigo);
    renderTable(allSubmissions);
  }catch(e){
    alert('Erro de conexão ao excluir o envio.');
    btn.disabled = false;
    btn.textContent = 'Excluir';
  }
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if(!q){
    renderTable(allSubmissions);
    return;
  }
  const filtered = allSubmissions.filter(sub => {
    const razaoSocial = ((sub.clientNome || sub.clientUsername) || '').toLowerCase();
    const tecnico = ((sub.fields && sub.fields.tecnico_nome) || '').toLowerCase();
    const cliente = (sub.clientUsername || '').toLowerCase();
    return sub.codigo.toLowerCase().includes(q) || razaoSocial.includes(q) || tecnico.includes(q) || cliente.includes(q);
  });
  renderTable(filtered);
});

document.getElementById('refreshBtn').addEventListener('click', loadSubmissions);

/* =========================================================================
   CLIENTES
   ========================================================================= */
async function loadClients(){
  try{
    const resp = await fetch('/api/admin/clients', {
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if(!resp.ok || !data.ok){
      alert(data.error || 'Erro ao carregar os clientes.');
      return;
    }
    allClients = data.clients || [];
    renderClientsTable(allClients);
  }catch(e){
    alert('Erro de conexão ao carregar os clientes.');
  }
}

function renderClientsTable(list){
  const tbody = document.getElementById('clientsTableBody');
  const emptyState = document.getElementById('clientsEmptyState');
  const countLabel = document.getElementById('clientCountLabel');

  tbody.innerHTML = '';
  countLabel.textContent = `${list.length} cliente(s)`;

  if(!list.length){
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  const pwCache = getTempPwCache();

  list.forEach(client => {
    const tr = document.createElement('tr');
    const statusBadge = client.active
      ? '<span class="badge ok">Ativo</span>'
      : '<span class="badge off">Inativo</span>';
    const pwBadge = client.mustChangePassword
      ? '<span class="badge warn">Aguardando 1º acesso</span>'
      : '<span class="badge ok">Definida</span>';

    // O botão "Copiar senha" só existe enquanto o cliente não fez o 1º acesso
    // (mustChangePassword ainda true) E a senha temporária foi gerada neste navegador.
    const hasCachedPw = client.mustChangePassword && pwCache[client.username];
    if (!client.mustChangePassword && pwCache[client.username]) {
      removeTempPwCache(client.username); // cliente já trocou a senha — some o botão pra sempre
    }
    const copyPwBtn = hasCachedPw
      ? `<button class="view-btn" data-action="copypw" data-username="${client.username}">Copiar senha</button>`
      : '';

    tr.innerHTML = `
      <td class="codigo">${client.username}</td>
      <td>${client.nome || '—'}</td>
      <td>${statusBadge}</td>
      <td>${pwBadge}</td>
      <td class="muted">${fmtDate(client.createdAt)}</td>
      <td class="actions">
        ${copyPwBtn}
        <button class="view-btn" data-action="reset" data-username="${client.username}">Resetar senha</button>
        <button class="view-btn" data-action="toggle" data-username="${client.username}" data-active="${client.active}">${client.active ? 'Desativar' : 'Ativar'}</button>
        <button class="del-btn" data-action="delete" data-username="${client.username}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action="copypw"]').forEach(btn => btn.addEventListener('click', () => copyClientTempPassword(btn)));
  tbody.querySelectorAll('[data-action="reset"]').forEach(btn => btn.addEventListener('click', () => resetClientPassword(btn)));
  tbody.querySelectorAll('[data-action="toggle"]').forEach(btn => btn.addEventListener('click', () => toggleClientActive(btn)));
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => deleteClient(btn)));
}

async function copyClientTempPassword(btn){
  const username = btn.dataset.username;
  const cache = getTempPwCache();
  const pwd = cache[username];
  if (!pwd) { alert('Senha temporária não disponível neste navegador. Use "Resetar senha" para gerar uma nova.'); return; }
  const ok = await copyToClipboard(pwd);
  flashButtonCopied(btn, 'Copiar senha');
  if (!ok) alert('Não foi possível copiar automaticamente.');
}

document.getElementById('createClientBtn').addEventListener('click', async () => {
  const usernameInput = document.getElementById('newClientUsername');
  const nomeInput = document.getElementById('newClientNome');
  const errorBox = document.getElementById('newClientError');
  const btn = document.getElementById('createClientBtn');
  errorBox.textContent = '';

  const username = usernameInput.value.trim();
  const nome = nomeInput.value.trim();

  if(!username){
    errorBox.textContent = 'Informe um nome de usuário.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Criando...';
  try{
    const resp = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ username, nome })
    });
    const data = await resp.json();
    if(!resp.ok || !data.ok){
      errorBox.textContent = data.error || 'Erro ao criar o cliente.';
      return;
    }
    usernameInput.value = '';
    nomeInput.value = '';
    setTempPwCache(data.username, data.tempPassword);
    loadClients();

    document.getElementById('tempPwTitle').textContent = `Senha temporária — ${data.username}`;
    document.getElementById('tempPwValue').textContent = data.tempPassword;
    openModal('tempPwModal');
  }catch(e){
    errorBox.textContent = 'Erro de conexão ao criar o cliente.';
  }finally{
    btn.disabled = false;
    btn.textContent = 'Criar cliente';
  }
});

async function resetClientPassword(btn){
  const username = btn.dataset.username;
  if(!confirm(`Gerar uma nova senha temporária para "${username}"? A sessão atual dele será encerrada.`)) return;

  btn.disabled = true;
  try{
    const resp = await fetch(`/api/admin/clients/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ resetPassword: true })
    });
    const data = await resp.json();
    if(!resp.ok || !data.ok){
      alert(data.error || 'Erro ao resetar a senha.');
      return;
    }
    setTempPwCache(username, data.tempPassword);
    loadClients();
    document.getElementById('tempPwTitle').textContent = `Nova senha temporária — ${username}`;
    document.getElementById('tempPwValue').textContent = data.tempPassword;
    openModal('tempPwModal');
  }catch(e){
    alert('Erro de conexão ao resetar a senha.');
  }finally{
    btn.disabled = false;
  }
}

async function toggleClientActive(btn){
  const username = btn.dataset.username;
  const isActive = btn.dataset.active === 'true';
  const nextActive = !isActive;

  btn.disabled = true;
  try{
    const resp = await fetch(`/api/admin/clients/${encodeURIComponent(username)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ active: nextActive })
    });
    const data = await resp.json();
    if(!resp.ok || !data.ok){
      alert(data.error || 'Erro ao atualizar o cliente.');
      return;
    }
    loadClients();
  }catch(e){
    alert('Erro de conexão ao atualizar o cliente.');
  }finally{
    btn.disabled = false;
  }
}

async function deleteClient(btn){
  const username = btn.dataset.username;
  if(!confirm(`Excluir o cliente "${username}"? Ele perderá o acesso ao formulário. Os envios já feitos não serão apagados.`)) return;

  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  try{
    const resp = await fetch(`/api/admin/clients/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if(!resp.ok || !data.ok){
      alert(data.error || 'Erro ao excluir o cliente.');
      btn.disabled = false;
      btn.textContent = 'Excluir';
      return;
    }
    allClients = allClients.filter(c => c.username !== username);
    renderClientsTable(allClients);
  }catch(e){
    alert('Erro de conexão ao excluir o cliente.');
    btn.disabled = false;
    btn.textContent = 'Excluir';
  }
}

document.getElementById('clientSearchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if(!q){
    renderClientsTable(allClients);
    return;
  }
  const filtered = allClients.filter(c =>
    c.username.toLowerCase().includes(q) || (c.nome || '').toLowerCase().includes(q)
  );
  renderClientsTable(filtered);
});

document.getElementById('refreshClientsBtn').addEventListener('click', loadClients);

prepareLogoForPdf();
