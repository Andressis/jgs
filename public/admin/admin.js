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

/* ---------------- XML ---------------- */
function escapeXml(value){
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildXml(rows, codigo, submission){
  const sections = [];
  let current = null;
  rows.slice(1).forEach(([sec, label, value]) => {
    if (!current || current.name !== sec) {
      current = { name: sec, items: [] };
      sections.push(current);
    }
    current.items.push([label, value]);
  });

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<resultado codigo="${escapeXml(codigo)}">\n`;
  xml += `  <cliente usuario="${escapeXml(submission.clientUsername || '')}">${escapeXml(submission.clientNome || '')}</cliente>\n`;
  xml += `  <enviadoEm>${escapeXml(submission.createdAt || '')}</enviadoEm>\n`;
  sections.forEach(sec => {
    xml += `  <secao nome="${escapeXml(sec.name)}">\n`;
    sec.items.forEach(([label, value]) => {
      xml += `    <campo nome="${escapeXml(label)}">${escapeXml(value)}</campo>\n`;
    });
    xml += `  </secao>\n`;
  });
  xml += '</resultado>\n';
  return xml;
}

function downloadTextFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
    const nome = (sub.fields && sub.fields.contato_nome) || '—';
    const email = (sub.fields && sub.fields.contato_email) || '—';
    const dataCalib = (sub.fields && sub.fields.data_calibracao) || '—';
    const cliente = sub.clientNome || sub.clientUsername || '—';

    tr.innerHTML = `
      <td class="codigo">${sub.codigo}</td>
      <td>${nome}</td>
      <td class="muted">${email}</td>
      <td class="muted">${cliente}</td>
      <td class="muted">${dataCalib}</td>
      <td class="muted">${fmtDate(sub.createdAt)}</td>
      <td class="actions">
        <button class="view-btn" data-codigo="${sub.codigo}">Ver</button>
        <button class="pdf-btn" data-codigo="${sub.codigo}">PDF</button>
        <button class="xml-btn" data-codigo="${sub.codigo}">XML</button>
        <button class="del-btn" data-codigo="${sub.codigo}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.pdf-btn').forEach(btn => btn.addEventListener('click', () => downloadPdfFor(btn)));
  tbody.querySelectorAll('.xml-btn').forEach(btn => btn.addEventListener('click', () => downloadXmlFor(btn)));
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

async function downloadXmlFor(btn){
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Gerando...';
  try{
    const submission = await fetchSubmission(codigo);
    const rows = submission.rows || [];
    const xml = buildXml(rows, codigo, submission);
    downloadTextFile(`resultados_${codigo.replace(/\s+/g,'-')}.xml`, xml, 'application/xml');
  }catch(e){
    alert(e.message || 'Erro de conexão ao gerar o XML.');
  }finally{
    btn.disabled = false;
    btn.textContent = 'XML';
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
    const nome = ((sub.fields && sub.fields.contato_nome) || '').toLowerCase();
    const email = ((sub.fields && sub.fields.contato_email) || '').toLowerCase();
    const cliente = ((sub.clientNome || sub.clientUsername) || '').toLowerCase();
    return sub.codigo.toLowerCase().includes(q) || nome.includes(q) || email.includes(q) || cliente.includes(q);
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

  list.forEach(client => {
    const tr = document.createElement('tr');
    const statusBadge = client.active
      ? '<span class="badge ok">Ativo</span>'
      : '<span class="badge off">Inativo</span>';
    const pwBadge = client.mustChangePassword
      ? '<span class="badge warn">Aguardando 1º acesso</span>'
      : '<span class="badge ok">Definida</span>';

    tr.innerHTML = `
      <td class="codigo">${client.username}</td>
      <td>${client.nome || '—'}</td>
      <td>${statusBadge}</td>
      <td>${pwBadge}</td>
      <td class="muted">${fmtDate(client.createdAt)}</td>
      <td class="actions">
        <button class="view-btn" data-action="reset" data-username="${client.username}">Resetar senha</button>
        <button class="view-btn" data-action="toggle" data-username="${client.username}" data-active="${client.active}">${client.active ? 'Desativar' : 'Ativar'}</button>
        <button class="del-btn" data-action="delete" data-username="${client.username}">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action="reset"]').forEach(btn => btn.addEventListener('click', () => resetClientPassword(btn)));
  tbody.querySelectorAll('[data-action="toggle"]').forEach(btn => btn.addEventListener('click', () => toggleClientActive(btn)));
  tbody.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => deleteClient(btn)));
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
