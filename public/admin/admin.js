/* ---------------- Estado ---------------- */
let adminPassword = null; // guardado só em memória desta aba, nunca em localStorage
let allSubmissions = [];

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
  doc.text(`Código do participante: ${codigo}`, marginX, y);
  y += 14;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, marginX, y);
  y += 22;

  const sections = [];
  let current = null;
  rows.slice(1).forEach(([sec, label, value]) => {
    if (!current || current.name !== sec) {
      current = { name: sec, items: [] };
      sections.push(current);
    }
    current.items.push([label, value && String(value).trim() !== '' ? value : '—']);
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
  }catch(e){
    errorBox.textContent = 'Erro de conexão. Tente novamente.';
  }
}

document.getElementById('loginBtn').addEventListener('click', tryLogin);
document.getElementById('passwordInput').addEventListener('keydown', e => {
  if(e.key === 'Enter') tryLogin();
});

/* ---------------- Carregar lista ---------------- */
async function loadSubmissions(){
  const tbody = document.getElementById('tableBody');
  const emptyState = document.getElementById('emptyState');
  const countLabel = document.getElementById('countLabel');

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

function fmtDate(iso){
  if(!iso) return '—';
  try{
    return new Date(iso).toLocaleString('pt-BR');
  }catch(e){ return '—'; }
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

    tr.innerHTML = `
      <td class="codigo">${sub.codigo}</td>
      <td>${nome}</td>
      <td class="muted">${email}</td>
      <td class="muted">${dataCalib}</td>
      <td class="muted">${fmtDate(sub.createdAt)}</td>
      <td><button class="pdf-btn" data-codigo="${sub.codigo}">Baixar PDF</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.pdf-btn').forEach(btn => {
    btn.addEventListener('click', () => downloadPdfFor(btn));
  });
}

/* ---------------- Baixar PDF de um envio específico ---------------- */
async function downloadPdfFor(btn){
  const codigo = btn.dataset.codigo;
  btn.disabled = true;
  btn.textContent = 'Gerando...';

  try{
    const resp = await fetch(`/api/admin/submissions/${encodeURIComponent(codigo)}`, {
      headers: { 'x-admin-password': adminPassword }
    });
    const data = await resp.json();
    if(!resp.ok || !data.ok){
      alert(data.error || 'Erro ao buscar os dados desse envio.');
      return;
    }
    const rows = data.submission.rows || [];
    const doc = buildPdf(rows, codigo);
    doc.save(`resultados_${codigo.replace(/\s+/g,'-')}.pdf`);
  }catch(e){
    alert('Erro de conexão ao gerar o PDF.');
  }finally{
    btn.disabled = false;
    btn.textContent = 'Baixar PDF';
  }
}

/* ---------------- Busca ---------------- */
document.getElementById('searchInput').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if(!q){
    renderTable(allSubmissions);
    return;
  }
  const filtered = allSubmissions.filter(sub => {
    const nome = ((sub.fields && sub.fields.contato_nome) || '').toLowerCase();
    const email = ((sub.fields && sub.fields.contato_email) || '').toLowerCase();
    return sub.codigo.toLowerCase().includes(q) || nome.includes(q) || email.includes(q);
  });
  renderTable(filtered);
});

document.getElementById('refreshBtn').addEventListener('click', loadSubmissions);

prepareLogoForPdf();
