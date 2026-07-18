// PBGC §436 Evaluation — v0.2.0
// Browser-only (file://). All local files are chosen via file inputs.
// Template delimiters: [[tag]]

function $(id){return document.getElementById(id);}

function setStatus(msg){
  $('status').textContent = msg || '';
}

function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

function mmddToMd(mmdd){
  // "01-01" -> "01/01"
  const m = /^\s*(\d{2})-(\d{2})\s*$/.exec(mmdd || '');
  if(!m) return '';
  return `${m[1]}/${m[2]}`;
}

function gatherInputs(){
  return {
    meta: { version: "v0.2.0", created_at: new Date().toISOString() },
    case: {
      to_name: $('toName').value.trim(),
      to_section: $('toSection').value.trim(),
      from_name: $('fromName').value.trim(),
      from_section: $('fromSection').value.trim(),
      memo_date: $('memoDate').value || todayISO(),
      subject: $('subject').value.trim() || '§436 Evaluation',

      plan_name: $('planName').value.trim(),
      ein_pin: $('einPin').value.trim(),
      pbgc_case_number: $('caseNumber').value.trim(),

      dopt: $('dopt').value || '',
      dotr: $('dotr').value || '',
      bpd: $('bpd').value || '',
      dobf: $('dobf').value || '',
      plan_year_start_mmdd: $('pyStart').value.trim() || '01-01'
    },

    // Tables are empty in v0.2.0; they populate in later versions
    aftap_rows: [],
    aftap_periods: [],

    cba: {
      cba_ratification_date: '',
      cba_effective_date: '',
      cba_expiration_date: '',
      cba_ips_ref: ''
    }
  };
}

function buildDocxData(input){
  const c = input.case;
  return {
    to_name: c.to_name,
    to_section: c.to_section,
    from_name: c.from_name,
    from_section: c.from_section,
    memo_date: c.memo_date,
    subject: c.subject,

    plan_name: c.plan_name,
    ein_pin: c.ein_pin,
    pbgc_case_number: c.pbgc_case_number,
    dopt: c.dopt,
    dotr: c.dotr,
    bpd: c.bpd,
    dobf: c.dobf,
    fd_py: mmddToMd(c.plan_year_start_mmdd),

    aftap_rows: input.aftap_rows,
    aftap_periods: input.aftap_periods,

    cba_ratification_date: input.cba.cba_ratification_date,
    cba_effective_date: input.cba.cba_effective_date,
    cba_expiration_date: input.cba.cba_expiration_date,
    cba_ips_ref: input.cba.cba_ips_ref
  };
}

async function readFileAsArrayBuffer(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed reading file."));
    r.onload = () => resolve(r.result);
    r.readAsArrayBuffer(file);
  });
}

async function generateDocx(){
  setStatus('');
  const templateFile = $('templateFile').files[0];
  if(!templateFile){
    setStatus("Select the template DOCX first.");
    return;
  }

  const input = gatherInputs();
  const data = buildDocxData(input);

  // Basic validation for v0.2.0
  const missing = [];
  if(!data.plan_name) missing.push("Plan name");
  if(!data.ein_pin) missing.push("EIN/PN");
  if(!data.pbgc_case_number) missing.push("PBGC case #");
  if(!data.dopt) missing.push("DOPT");
  if(!data.fd_py) missing.push("Plan year start (MM-DD)");
  if(missing.length){
    setStatus("Missing required header fields:\n- " + missing.join("\n- "));
    return;
  }

  try{
    const ab = await readFileAsArrayBuffer(templateFile);
    const zip = new PizZip(ab);
    const doc = new window.docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '[[', end: ']]' }
    });

    doc.render(data);

    const out = doc.getZip().generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });

    const safeCase = (data.pbgc_case_number || "CASE").replace(/[^A-Za-z0-9_-]+/g,'_');
    const filename = `436_Evaluation_${safeCase}_v0.2.0.docx`;
    saveAs(out, filename);

    setStatus("Generated: " + filename + "\nNext: v0.4.0 fills Part 2 table; v0.5.0 computes presumed AFTAPs for Part 3.");
  }catch(e){
    // docxtemplater throws rich errors; keep it readable.
    setStatus("DOCX generation error:\n" + (e.message || String(e)));
    console.error(e);
  }
}

function downloadInputs(){
  const input = gatherInputs();
  const blob = new Blob([JSON.stringify(input, null, 2)], {type:"application/json"});
  const filename = `case436_inputs_v0.2.0.json`;
  saveAs(blob, filename);
  setStatus("Downloaded: " + filename);
}

window.addEventListener('DOMContentLoaded', ()=>{
  $('memoDate').value = todayISO();
  $('btnGenerate').addEventListener('click', generateDocx);
  $('btnDownloadInputs').addEventListener('click', downloadInputs);
});
