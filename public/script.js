/* ---------------- CONFIG ---------------- */
const LAB_EMAIL = "contato@seulaboratorio.com.br"; // <-- troque pelo e-mail do laboratório

/* ---------------- Auto-generated participant code (nunca se repete) ----------------
   Todos os códigos já exibidos ficam guardados no localStorage deste navegador.
   Antes de mostrar um novo código, ele é conferido contra essa lista; se já existir,
   um novo é sorteado até achar um inédito (com um fallback à prova de falhas). */
const USED_CODES_KEY = 'pt_used_codes_v1';

function getUsedCodes(){
  try{
    const raw = localStorage.getItem(USED_CODES_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    return [];
  }
}

function saveUsedCode(code){
  try{
    const codes = getUsedCodes();
    codes.push(code);
    localStorage.setItem(USED_CODES_KEY, JSON.stringify(codes));
  }catch(e){
    // localStorage indisponível (ex.: navegação privada) — segue sem persistir
  }
}

function generateCode(){
  const usedCodes = getUsedCodes();
  let code;
  let attempts = 0;
  do{
    const n = Math.floor(100000 + Math.random() * 900000); // 6 dígitos aleatórios
    code = `JGS-${n}`;
    attempts++;
  } while(usedCodes.includes(code) && attempts < 2000);

  // fallback à prova de falhas: se os 900.000 códigos possíveis já tiverem sido usados
  if(usedCodes.includes(code)){
    code = `PT-${Date.now().toString(36).toUpperCase()}`;
  }

  saveUsedCode(code);
  const input = document.getElementById('codigo');
  input.value = code;
  input.classList.remove('missing');
  updateProgress();
}

/* ---------------- Test data filler ---------------- */
function fillTestData(){
  const rnd = (min, max, dec=3) => (Math.random() * (max - min) + min).toFixed(dec);
  const veffOptions = ['2', '3', '4', '6', 'infinito', '99'];
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  const today = new Date();
  const fmt = d => d.toISOString().split('T')[0];
  const chegada = new Date(today); chegada.setDate(chegada.getDate() - 5);
  const calibracao = new Date(today); calibracao.setDate(calibracao.getDate() - 3);
  const saida = new Date(today); saida.setDate(saida.getDate() - 1);

  document.getElementById('data_chegada').value = fmt(chegada);
  document.getElementById('data_calibracao').value = fmt(calibracao);
  document.getElementById('data_saida').value = fmt(saida);

  const setEnv = prefix => {
    document.getElementById(`${prefix}_temp_agua`).value = rnd(18, 22, 1);
    document.getElementById(`${prefix}_temp_amb`).value = rnd(18, 22, 1);
    document.getElementById(`${prefix}_umidade`).value = rnd(45, 80, 0);
    document.getElementById(`${prefix}_pressao`).value = rnd(910, 930, 1);
    document.getElementById(`${prefix}_massa_esp`).value = rnd(0.996, 0.999, 4);
  };
  const setMeasure = (prefix, volMin, volMax, incMin, incMax) => {
    document.getElementById(`${prefix}_volume`).value = rnd(volMin, volMax, 3);
    document.getElementById(`${prefix}_incerteza`).value = rnd(incMin, incMax, 3);
    document.getElementById(`${prefix}_k`).value = rnd(2, 4.53, 2);
    document.getElementById(`${prefix}_veff`).value = pick(veffOptions);
    setEnv(prefix);
  };
  const setCycles = (idPrefix, volMin, volMax, incMin, incMax, withMass, withEscoamento) => {
    ['1'].forEach(c => {
      const p = `${idPrefix}_c${c}`;
      if (withMass) {
        document.getElementById(`${p}_massa_vazia`).value = rnd(51, 52, 4);
        document.getElementById(`${p}_massa_cheia`).value = rnd(151, 152, 4);
      }
      if (withEscoamento) {
        document.getElementById(`${p}_tempo_escoamento`).value = rnd(15, 40, 1);
      }
      setMeasure(p, volMin, volMax, incMin, incMax);
    });
  };

  // Balão (1 ciclo)
  setCycles('balao', 99.9, 100.1, 0.01, 0.05, true, false);

  // Pipeta (1 ciclo)
  setCycles('pipeta', 9.9, 10.1, 0.005, 0.02, false, false);

  // Bureta (3 pontos × 1 ciclo)
  setCycles('bureta_1', 0.95, 1.05, 0.005, 0.02, false, true);
  setCycles('bureta_5', 4.9, 5.1, 0.005, 0.02, false, true);
  setCycles('bureta_10', 9.9, 10.1, 0.005, 0.02, false, true);

  // Micropipeta (3 pontos × 1 ciclo)
  setCycles('micro_10', 10.0, 10.6, 0.1, 0.3, false, false);
  setCycles('micro_50', 49.8, 50.6, 0.1, 0.3, false, false);
  setCycles('micro_100', 99.8, 101.2, 0.1, 0.4, false, false);

  // Contato
  document.getElementById('contato_nome').value = 'Laboratório Exemplo Ltda';
  document.getElementById('contato_email').value = 'teste@exemplo.com.br';
  document.getElementById('contato_telefone').value = '(41) 90000-0000';

  document.querySelectorAll('.section').forEach(s => s.classList.add('open'));
  updateProgress();
}

/* ---------------- Build measurement fields ----------------
   unit: unidade de volume exibida nos rótulos (ex.: 'mL' ou 'μL')
   withMass: inclui campos de massa vazia/cheia (Balão)
   withEscoamento: inclui campo de tempo de escoamento em segundos (Bureta) */
function buildCycleFields(prefix, sectionKey, placeholders, withMass, unit = 'mL', withEscoamento = false){
  const massFields = withMass ? `
          <div class="field"><label>Massa vazio e seco (g)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_massa_vazia" placeholder="51,86"></div>
          <div class="field"><label>Média massa cheio (g)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_massa_cheia" placeholder="151,56"></div>` : '';
  const escoamentoField = withEscoamento ? `
          <div class="field"><label>Tempo de Escoamento (s)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_tempo_escoamento" placeholder="28,5"></div>` : '';
  return `
    <div class="split">
      <div>
        <p class="subhead">Medição</p>
        <div class="field-grid">${massFields}
          <div class="field"><label>Volume medido (${unit})</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_volume" placeholder="${placeholders.volume}"></div>
          <div class="field"><label>Incerteza de medição (${unit})</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_incerteza" placeholder="${placeholders.incerteza}"></div>
          <div class="field"><label>k</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_k" placeholder="${placeholders.k}"></div>
          <div class="field"><label>Veff</label><input type="text" data-section="${sectionKey}" id="${prefix}_veff" placeholder="ex.: 2 ou infinito"></div>${escoamentoField}
        </div>
      </div>
      <div>
        <p class="subhead">Condições ambientais</p>
        <div class="field-grid">
          <div class="field"><label>Temperatura água (°C)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_temp_agua" placeholder="19,8"></div>
          <div class="field"><label>Temperatura ambiente (°C)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_temp_amb" placeholder="19,5"></div>
          <div class="field"><label>Umidade relativa (%)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_umidade" placeholder="73"></div>
          <div class="field"><label>Pressão atmosférica (hPa)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_pressao" placeholder="924,65"></div>
          <div class="field"><label>Massa específica da água (g/mL)</label><input type="number" step="any" data-section="${sectionKey}" id="${prefix}_massa_esp" placeholder="0,9982"></div>
        </div>
      </div>
    </div>
  `;
}

function buildCycleBlock(container, prefix, sectionKey, label, placeholders, withMass, unit = 'mL', withEscoamento = false){
  const div = document.createElement('div');
  div.className = 'point';
  div.innerHTML = `<div class="point-title">${label}</div>` + buildCycleFields(prefix, sectionKey, placeholders, withMass, unit, withEscoamento);
  container.appendChild(div);
}

// For single-point instruments (Balão, Pipeta): 1 ciclo de medição diretamente na seção.
function buildCycles(container, idPrefix, sectionKey, placeholders, withMass, unit = 'mL'){
  buildCycleBlock(container, `${idPrefix}_c1`, sectionKey, 'Medição', placeholders, withMass, unit, false);
}

// For multi-point instruments (Bureta, Micropipeta): each point gets 1 ciclo de medição.
function buildPointGroup(container, pointPrefix, sectionKey, pointLabel, placeholders, unit = 'mL', withEscoamento = false){
  const wrapper = document.createElement('div');
  wrapper.className = 'point-group';
  wrapper.innerHTML = `<div class="point-group-title">${pointLabel}</div>`;
  container.appendChild(wrapper);
  buildCycleBlock(wrapper, `${pointPrefix}_c1`, sectionKey, 'Medição', placeholders, false, unit, withEscoamento);
}

/* ---------------- Section toggle ---------------- */
function toggleSection(headEl){
  headEl.parentElement.classList.toggle('open');
}

/* ---------------- Progress + status tracking ---------------- */
const allInputs = () => Array.from(document.querySelectorAll('.field-grid input'));

function updateProgress(){
  const inputs = allInputs();
  const filled = inputs.filter(i => i.value.trim() !== '').length;
  const pct = inputs.length ? Math.round((filled / inputs.length) * 100) : 0;

  document.getElementById('gaugePct').textContent = pct + '%';
  document.getElementById('mobilePct').textContent = pct + '%';
  document.getElementById('mobileFill').style.width = pct + '%';

  const liquid = document.getElementById('liquidRect');
  const maxH = 128;
  const h = Math.round((pct/100) * maxH);
  liquid.setAttribute('height', h);
  liquid.setAttribute('y', 8 + (maxH - h));

  // per-section status counts
  const sections = {};
  inputs.forEach(i => {
    const s = i.dataset.section;
    if(!sections[s]) sections[s] = {total:0, filled:0};
    sections[s].total++;
    if(i.value.trim() !== '') sections[s].filled++;
  });
  Object.keys(sections).forEach(s => {
    const el = document.querySelector(`[data-status="${s}"]`);
    if(el) el.textContent = `${sections[s].filled}/${sections[s].total}`;
  });
}

/* ---------------- Validation ---------------- */
// Retorna os elementos <input> do formulário que ainda estão vazios.
function validate(){
  return allInputs().filter(i => i.value.trim() === '');
}

function collectRows(){
  const g = id => (document.getElementById(id) ? document.getElementById(id).value : '');
  const rows = [];
  rows.push(['Seção','Campo','Valor']);

  rows.push(['Identificação','Código do participante', g('codigo')]);
  rows.push(['Identificação','Data da chegada', g('data_chegada')]);
  rows.push(['Identificação','Data da calibração', g('data_calibracao')]);
  rows.push(['Identificação','Data da saída', g('data_saida')]);

  const cycleFields = (prefix, withMass, unit = 'mL', withEscoamento = false) => {
    const f = [];
    if (withMass) {
      f.push(['Massa vazio e seco (g)', `${prefix}_massa_vazia`]);
      f.push(['Média massa cheio (g)', `${prefix}_massa_cheia`]);
    }
    f.push(
      [`Volume medido (${unit})`, `${prefix}_volume`],
      [`Incerteza de medição (${unit})`, `${prefix}_incerteza`],
      ['k', `${prefix}_k`],
      ['Veff', `${prefix}_veff`]
    );
    if (withEscoamento) {
      f.push(['Tempo de Escoamento (s)', `${prefix}_tempo_escoamento`]);
    }
    f.push(
      ['Temperatura água (°C)', `${prefix}_temp_agua`],
      ['Temperatura ambiente (°C)', `${prefix}_temp_amb`],
      ['Umidade relativa (%)', `${prefix}_umidade`],
      ['Pressão atmosférica (hPa)', `${prefix}_pressao`],
      ['Massa específica da água (g/mL)', `${prefix}_massa_esp`]
    );
    return f;
  };

  const addCycle = (sectionLabel, idPrefix, withMass, unit = 'mL', withEscoamento = false) => {
    const p = `${idPrefix}_c1`;
    cycleFields(p, withMass, unit, withEscoamento).forEach(([label, id]) => rows.push([sectionLabel, `Medição — ${label}`, g(id)]));
  };

  addCycle('Balão Volumétrico de 100 mL', 'balao', true);
  addCycle('Pipeta Volumétrica de 10 mL', 'pipeta', false);

  ['1','5','10'].forEach(pt => {
    addCycle(`Bureta de Vidro de 10 mL — ${pt} mL`, `bureta_${pt}`, false, 'mL', true);
  });

  ['10','50','100'].forEach(pt => {
    addCycle(`Micropipeta Graduada de 10 μL a 100 μL — ${pt} μL`, `micro_${pt}`, false, 'μL');
  });

  rows.push(['Contato','Nome / Empresa', g('contato_nome')]);
  rows.push(['Contato','E-mail', g('contato_email')]);
  rows.push(['Contato','Telefone', g('contato_telefone')]);

  return rows;
}

/* ---------------- Logo (carregado antecipadamente para uso no PDF) ---------------- */
let logoDataUrl = null;
let logoAspectRatio = null; // largura / altura

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
      // ex.: bloqueado por CORS ao abrir o arquivo direto como file:// — PDF segue sem logo
      logoDataUrl = null;
    }
  };
  if(img.complete && img.naturalWidth){
    toDataUrl();
  }else{
    img.addEventListener('load', toDataUrl);
  }
}

/* ---------------- PDF generation ---------------- */
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

  // group flat rows into sections, skipping the header row
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

/* ---------------- Envio dos dados para o banco (MongoDB Atlas via /api/save-results) ---------------- */
function collectFieldsAsObject(){
  // Monta um objeto { id_do_campo: valor } a partir de todos os inputs do formulário.
  // Fica mais fácil de consultar no MongoDB do que a lista de linhas usada no PDF.
  const obj = {};
  allInputs().forEach(i => { obj[i.id] = i.value; });
  return obj;
}

async function saveResultsToDatabase(rows, codigo){
  try{
    const resp = await fetch('/api/save-results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo,
        fields: collectFieldsAsObject(),
        rows
      })
    });
    if(!resp.ok){
      const errData = await resp.json().catch(() => ({}));
      console.error('Falha ao salvar no banco de dados:', errData.error || resp.status);
      return false;
    }
    return true;
  }catch(e){
    // Falha de rede não deve travar o download do PDF, que já aconteceu antes desta chamada.
    console.error('Erro de rede ao salvar no banco de dados:', e);
    return false;
  }
}

function handleSubmit(){
  // limpa marcações amarelas de uma tentativa anterior
  document.querySelectorAll('.field-grid input.missing').forEach(i => i.classList.remove('missing'));

  const missingInputs = validate();
  const errorBox = document.getElementById('errorList');

  if(missingInputs.length){
    missingInputs.forEach(i => {
      i.classList.add('missing');
      const sectionEl = i.closest('.section');
      if(sectionEl) sectionEl.classList.add('open'); // abre a seção para o campo ficar visível
    });

    errorBox.classList.add('show');
    errorBox.innerHTML = `<strong>Ainda há ${missingInputs.length} campo(s) não preenchido(s).</strong> Eles foram destacados em amarelo no formulário.`;
    missingInputs[0].scrollIntoView({behavior:'smooth', block:'center'});
    missingInputs[0].focus();
    return;
  }
  errorBox.classList.remove('show');

  const rows = collectRows();
  const codigo = document.getElementById('codigo').value.trim() || 'participante';
  const fileName = `resultados_${codigo.replace(/\s+/g,'-')}.pdf`;
  const doc = buildPdf(rows, codigo);
  doc.save(fileName);

  // Salva os dados no MongoDB Atlas (não bloqueia nem atrasa o download do PDF acima).
  saveResultsToDatabase(rows, codigo);

  document.getElementById('fileNameOut').textContent = fileName;
  const subject = encodeURIComponent(`Resultados Ensaio de Proficiência — ${codigo}`);
  const body = encodeURIComponent(`Olá,\n\nSegue em anexo o arquivo com os resultados do ensaio de proficiência.\n\nCódigo do participante: ${codigo}\n\nNão esqueça de anexar o arquivo "${fileName}" que foi baixado para o seu computador.\n\nAtenciosamente,\n${document.getElementById('contato_nome').value.trim()}`);
  document.getElementById('mailtoBtn').href = `mailto:${LAB_EMAIL}?subject=${subject}&body=${body}`;

  const panel = document.getElementById('confirmPanel');
  panel.classList.add('show');
  panel.scrollIntoView({behavior:'smooth', block:'center'});
}

/* ---------------- Run on load (order matters: after all functions above are defined) ---------------- */
buildCycles(document.getElementById('balaoCycles'), 'balao', 'balao',
  {volume:'99,995', incerteza:'0,030', k:'2,00'}, true, 'mL');

buildCycles(document.getElementById('pipetaCycles'), 'pipeta', 'pipeta',
  {volume:'10,006', incerteza:'0,011', k:'4,53'}, false, 'mL');

buildPointGroup(document.getElementById('buretaPoints'), 'bureta_1', 'bureta', 'Volume medido 1 mL', {volume:'1,000', incerteza:'0,010', k:'2,01'}, 'mL', true);
buildPointGroup(document.getElementById('buretaPoints'), 'bureta_5', 'bureta', 'Volume medido 5 mL', {volume:'4,990', incerteza:'0,010', k:'2,02'}, 'mL', true);
buildPointGroup(document.getElementById('buretaPoints'), 'bureta_10', 'bureta', 'Volume medido 10 mL', {volume:'9,980', incerteza:'0,010', k:'2,00'}, 'mL', true);

buildPointGroup(document.getElementById('microPoints'), 'micro_10', 'micro', 'Volume medido 10 μL', {volume:'10,40', incerteza:'0,20', k:'2,00'}, 'μL', false);
buildPointGroup(document.getElementById('microPoints'), 'micro_50', 'micro', 'Volume medido 50 μL', {volume:'50,50', incerteza:'0,20', k:'2,00'}, 'μL', false);
buildPointGroup(document.getElementById('microPoints'), 'micro_100', 'micro', 'Volume medido 100 μL', {volume:'100,70', incerteza:'0,20', k:'2,00'}, 'μL', false);

generateCode();
prepareLogoForPdf();
document.addEventListener('input', (e) => {
  updateProgress();
  // remove o destaque amarelo assim que o campo é preenchido
  if(e.target.classList && e.target.classList.contains('missing') && e.target.value.trim() !== ''){
    e.target.classList.remove('missing');
  }
});
updateProgress();
