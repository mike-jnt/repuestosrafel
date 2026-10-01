'use strict';

function pdfStoreOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('repuestos_docs_c1_8', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('pdfs')) req.result.createObjectStore('pdfs'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function pdfStorePut(key, blob) { const db = await pdfStoreOpen(); return new Promise((resolve,reject)=>{ const tx=db.transaction('pdfs','readwrite'); tx.objectStore('pdfs').put(blob,key); tx.oncomplete=()=>{db.close();resolve();}; tx.onerror=()=>{db.close();reject(tx.error);}; }); }
async function pdfStoreGet(key) { const db = await pdfStoreOpen(); return new Promise((resolve,reject)=>{ const tx=db.transaction('pdfs','readonly'); const req=tx.objectStore('pdfs').get(key); req.onsuccess=()=>{db.close();resolve(req.result||null);}; req.onerror=()=>{db.close();reject(req.error);}; }); }
async function pdfStoreDelete(key) { const db = await pdfStoreOpen(); return new Promise((resolve,reject)=>{ const tx=db.transaction('pdfs','readwrite'); tx.objectStore('pdfs').delete(key); tx.oncomplete=()=>{db.close();resolve();}; tx.onerror=()=>{db.close();reject(tx.error);}; }); }

function invoicePdfFileName(order, version = 1) {
  return `FACTURA_COMPRA_${order.number}-V${version}.pdf`;
}

function invalidateOrderPdf(order) {
  const oldName = order.pdf?.fileName;
  const version = num(order.pdf?.version) + 1 || 1;
  order.pdf = { generated: false, version, layoutVersion: 2, fileName: invoicePdfFileName(order, version), storage: 'firestore-base64', invalidatedAt: nowIso(), needsUpload: true };
  if (oldName) pdfStoreDelete(oldName).catch(() => {});
}

function pdfEscape(text) { return String(text ?? '').replace(/[\\()]/g, '\\$&').replace(/[\r\n]+/g, ' '); }
function latin1Bytes(text) { const bytes = new Uint8Array(text.length); for (let i=0;i<text.length;i++) bytes[i]=text.charCodeAt(i)&255; return bytes; }
function concatBytes(chunks) { const total=chunks.reduce((s,x)=>s+x.length,0), out=new Uint8Array(total); let at=0; chunks.forEach(x=>{out.set(x,at);at+=x.length;}); return out; }
function base64Bytes(value) { const binary=atob(value); const out=new Uint8Array(binary.length); for(let i=0;i<binary.length;i++) out[i]=binary.charCodeAt(i); return out; }
function estimateTextWidth(text,size) { return String(text).length*size*.49; }
function pad(value,length,right=false) { let text=String(value??''); if(text.length>length) text=text.slice(0,length); return right?text.padStart(length,' '):text.padEnd(length,' '); }
function chunkLines(lines,max) { const pages=[]; for(let i=0;i<lines.length;i+=max) pages.push(lines.slice(i,i+max)); return pages.length?pages:[[]]; }
function colorCommand(color) { const c=BRAND_COLORS[color]||color||BRAND_COLORS.dark; return `${c[0]} ${c[1]} ${c[2]} rg`; }

function pdfPageStream(lines) {
  let y=686;
  const parts=[
    'q', '172 0 0 104 45 724 cm', '/Im1 Do', 'Q',
    colorCommand('accent'), '45 708 505 4 re f'
  ];
  for(const line of lines){
    const size=line.size||10;
    let x=line.x||45;
    if(line.align==='right') x=550;
    parts.push('BT');
    parts.push(colorCommand(line.color||'dark'));
    parts.push(`/${line.bold?'F2':'F1'} ${size} Tf`);
    parts.push(`${x} ${y} Td`);
    if(line.align==='right') parts.push(`${-estimateTextWidth(line.text,size)} 0 Td`);
    parts.push(`(${pdfEscape(line.text)}) Tj`);
    parts.push('ET');
    y-=Math.max(12,size+4);
  }
  return parts.join('\n');
}

function createPdfBlob(lines) {
  const pages=chunkLines(lines,37), objects=[], pageIds=[];
  const addObject=body=>{objects.push(typeof body==='string'?latin1Bytes(body):body);return objects.length;};
  const fontId=addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBoldId=addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const logoBytes=base64Bytes(BRAND_LOGO_JPEG_BASE64);
  const imageBody=concatBytes([
    latin1Bytes(`<< /Type /XObject /Subtype /Image /Width ${BRAND_LOGO_WIDTH} /Height ${BRAND_LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n`),
    logoBytes,
    latin1Bytes('\nendstream')
  ]);
  const imageId=addObject(imageBody);
  const pagesId=addObject('');
  pages.forEach(pageLines=>{
    const stream=latin1Bytes(pdfPageStream(pageLines));
    const contentBody=concatBytes([latin1Bytes(`<< /Length ${stream.length} >>\nstream\n`),stream,latin1Bytes('\nendstream')]);
    const contentId=addObject(contentBody);
    const pageId=addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[pagesId-1]=latin1Bytes(`<< /Type /Pages /Kids [${pageIds.map(x=>`${x} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const catalogId=addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const chunks=[latin1Bytes('%PDF-1.4\n%âãÏÓ\n')], offsets=[0];
  let position=chunks[0].length;
  objects.forEach((body,index)=>{
    offsets[index+1]=position;
    const objectChunk=concatBytes([latin1Bytes(`${index+1} 0 obj\n`),body,latin1Bytes('\nendobj\n')]);
    chunks.push(objectChunk); position+=objectChunk.length;
  });
  const xref=position;
  let trailer=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=objects.length;i++) trailer+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  trailer+=`trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  chunks.push(latin1Bytes(trailer));
  return new Blob(chunks,{type:'application/pdf'});
}


function strokeColorCommand(color) {
  const c = BRAND_COLORS[color] || color || BRAND_COLORS.dark;
  return `${c[0]} ${c[1]} ${c[2]} RG`;
}

function pdfTextAt(parts, text, x, y, size = 9, options = {}) {
  const value = String(text ?? '');
  if (!value) return;
  const bold = Boolean(options.bold);
  const color = options.color || 'dark';
  let drawX = x;
  if (options.align === 'right') drawX -= estimateTextWidth(value, size);
  if (options.align === 'center') drawX -= estimateTextWidth(value, size) / 2;
  parts.push('BT', colorCommand(color), `/${bold ? 'F2' : 'F1'} ${size} Tf`, `${drawX} ${y} Td`, `(${pdfEscape(value)}) Tj`, 'ET');
}

function pdfFillRect(parts, x, y, width, height, color) {
  parts.push('q', colorCommand(color), `${x} ${y} ${width} ${height} re f`, 'Q');
}

function pdfStrokeRect(parts, x, y, width, height, color = [0.82, 0.85, 0.89], lineWidth = 0.7) {
  parts.push('q', strokeColorCommand(color), `${lineWidth} w`, `${x} ${y} ${width} ${height} re S`, 'Q');
}

function pdfRule(parts, x1, y1, x2, y2, color = 'accent', lineWidth = 1) {
  parts.push('q', strokeColorCommand(color), `${lineWidth} w`, `${x1} ${y1} m ${x2} ${y2} l S`, 'Q');
}

function pdfShort(value, max = 42) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function buildPdfFromPageStreams(pageStreams) {
  const objects = [], pageIds = [];
  const addObject = body => { objects.push(typeof body === 'string' ? latin1Bytes(body) : body); return objects.length; };
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBoldId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const logoBytes = base64Bytes(BRAND_LOGO_JPEG_BASE64);
  const imageBody = concatBytes([
    latin1Bytes(`<< /Type /XObject /Subtype /Image /Width ${BRAND_LOGO_WIDTH} /Height ${BRAND_LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n`),
    logoBytes,
    latin1Bytes('\nendstream')
  ]);
  const imageId = addObject(imageBody);
  const pagesId = addObject('');
  pageStreams.forEach(pageStream => {
    const stream = latin1Bytes(pageStream);
    const contentBody = concatBytes([latin1Bytes(`<< /Length ${stream.length} >>\nstream\n`), stream, latin1Bytes('\nendstream')]);
    const contentId = addObject(contentBody);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[pagesId - 1] = latin1Bytes(`<< /Type /Pages /Kids [${pageIds.map(x => `${x} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  const chunks = [latin1Bytes('%PDF-1.4\n%âãÏÓ\n')], offsets = [0];
  let position = chunks[0].length;
  objects.forEach((body, index) => {
    offsets[index + 1] = position;
    const objectChunk = concatBytes([latin1Bytes(`${index + 1} 0 obj\n`), body, latin1Bytes('\nendobj\n')]);
    chunks.push(objectChunk);
    position += objectChunk.length;
  });
  const xref = position;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) trailer += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  chunks.push(latin1Bytes(trailer));
  return new Blob(chunks, { type: 'application/pdf' });
}

function invoicePageStream(order, pageItems, pageIndex, pageCount) {
  const s = DB.settings || {};
  const client = typeof clientById === 'function' ? clientById(order.clientId) : null;
  const payments = (DB.payments || []).filter(payment => payment.orderId === order.id && payment.status !== 'Anulado').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const isLast = pageIndex === pageCount - 1;
  const parts = [];
  const lightBlue = [0.94, 0.97, 0.99];
  const lighter = [0.975, 0.982, 0.99];
  const border = [0.79, 0.83, 0.88];
  const white = [1, 1, 1];

  // Header and brand.
  parts.push('q', '158 0 0 95 40 738 cm', '/Im1 Do', 'Q');
  pdfTextAt(parts, s.documentLabel || 'FACTURA DE COMPRA', 545, 792, 16, { bold: true, color: 'primary', align: 'right' });
  pdfTextAt(parts, 'DOCUMENTO COMERCIAL', 550, 774, 8, { bold: true, color: 'muted', align: 'right' });
  pdfTextAt(parts, `No. ${order.number}`, 550, 751, 12, { bold: true, color: 'primary2', align: 'right' });
  pdfRule(parts, 40, 727, 555, 727, 'accent', 3);

  const businessBits = [s.nit, [s.address, s.city].filter(Boolean).join(' '), s.phone, s.email].filter(Boolean);
  pdfTextAt(parts, businessBits.join('  |  '), 40, 712, 8, { color: 'muted' });

  // Customer and document information block.
  pdfFillRect(parts, 40, 615, 515, 82, lightBlue);
  pdfStrokeRect(parts, 40, 615, 515, 82, border, 0.8);
  pdfRule(parts, 335, 615, 335, 697, border, 0.6);
  pdfTextAt(parts, 'CLIENTE', 50, 680, 9, { bold: true, color: 'primary' });
  pdfTextAt(parts, pdfShort(order.clientName, 47), 50, 662, 11, { bold: true, color: 'dark' });
  if (order.clientDocument) pdfTextAt(parts, `NIT / Documento: ${order.clientDocument}`, 50, 646, 8, { color: 'muted' });
  const contact = [client?.contactName, order.clientWhatsapp].filter(Boolean).join('  |  ');
  if (contact) pdfTextAt(parts, pdfShort(contact, 55), 50, 632, 8, { color: 'muted' });
  const address = [order.clientAddress, order.clientCity].filter(Boolean).join(', ');
  if (address) pdfTextAt(parts, pdfShort(address, 60), 50, 620, 8, { color: 'muted' });

  pdfTextAt(parts, 'DATOS DE LA COMPRA', 347, 680, 9, { bold: true, color: 'primary' });
  pdfTextAt(parts, `Fecha: ${dateTime(order.createdAt)}`, 347, 662, 8, { color: 'dark' });
  if (order.dueDate) pdfTextAt(parts, `Vencimiento: ${dateOnly(order.dueDate)}`, 347, 648, 8, { color: 'dark' });
  pdfTextAt(parts, `Entrega: ${pdfShort(order.deliveryType || 'No definida', 24)}`, 347, 634, 8, { color: 'dark' });
  pdfTextAt(parts, `Pago: ${pdfShort(order.paymentMethod || 'No definido', 24)}`, 347, 620, 8, { color: 'dark' });

  // Item table.
  const tableTop = 585;
  pdfFillRect(parts, 40, tableTop, 515, 24, 'primary');
  pdfTextAt(parts, 'CODIGO', 48, tableTop + 8, 8, { bold: true, color: white });
  pdfTextAt(parts, 'PRODUCTO', 119, tableTop + 8, 8, { bold: true, color: white });
  pdfTextAt(parts, 'PRESENTACION', 326, tableTop + 8, 8, { bold: true, color: white });
  pdfTextAt(parts, 'CANT.', 425, tableTop + 8, 8, { bold: true, color: white, align: 'right' });
  pdfTextAt(parts, 'V. UNIT.', 493, tableTop + 8, 8, { bold: true, color: white, align: 'right' });
  pdfTextAt(parts, 'TOTAL', 548, tableTop + 8, 8, { bold: true, color: white, align: 'right' });

  let rowY = tableTop - 25;
  pageItems.forEach((item, index) => {
    if (index % 2 === 1) pdfFillRect(parts, 40, rowY - 2, 515, 23, lighter);
    pdfRule(parts, 40, rowY - 3, 555, rowY - 3, border, 0.35);
    pdfTextAt(parts, pdfShort(item.code, 12), 48, rowY + 6, 8, { bold: true, color: 'primary2' });
    pdfTextAt(parts, pdfShort(item.name, 34), 119, rowY + 6, 8, { color: 'dark' });
    pdfTextAt(parts, pdfShort(item.presentation || item.unit || '', 16), 326, rowY + 6, 7.5, { color: 'muted' });
    pdfTextAt(parts, String(num(item.quantity)), 425, rowY + 6, 8, { color: 'dark', align: 'right' });
    pdfTextAt(parts, money(item.price), 493, rowY + 6, 8, { color: 'dark', align: 'right' });
    pdfTextAt(parts, money(item.lineTotal), 548, rowY + 6, 8, { bold: true, color: 'dark', align: 'right' });
    rowY -= 24;
  });
  pdfStrokeRect(parts, 40, rowY - 2, 515, tableTop - rowY + 2, border, 0.7);

  if (isLast) {
    const totalX = 350;
    const totalY = Math.max(150, Math.min(330, rowY - 145));
    const infoTop = totalY + 108;
    const notesTop = totalY - 20;
    pdfFillRect(parts, totalX, totalY, 205, 122, lightBlue);
    pdfStrokeRect(parts, totalX, totalY, 205, 122, border, 0.8);
    const totalRows = [
      ['Subtotal', money(order.subtotal)],
      ['Entrega', money(order.deliveryCost)],
      ...(num(order.returnCredit) > 0 ? [['Devoluciones / notas', `-${money(order.returnCredit)}`]] : []),
      ['Total', money(orderEffectiveTotal(order))],
      ['Pagado / abonado', money(order.paid)],
      ['Saldo pendiente', money(order.balance)]
    ];
    let ty = totalY + 102;
    totalRows.forEach(([label, value], index) => {
      const isTotal = label === 'Total' || label === 'Saldo pendiente';
      if (label === 'Total') pdfRule(parts, totalX + 12, ty + 10, totalX + 193, ty + 10, 'accent', 1.2);
      pdfTextAt(parts, label, totalX + 12, ty, isTotal ? 10 : 8, { bold: isTotal, color: isTotal ? 'primary' : 'muted' });
      pdfTextAt(parts, value, totalX + 193, ty, isTotal ? 11 : 8.5, { bold: true, color: label === 'Saldo pendiente' && num(order.balance) > 0 ? 'accent' : 'dark', align: 'right' });
      ty -= 18;
    });

    pdfTextAt(parts, 'INFORMACION DE PAGO Y ENTREGA', 40, infoTop, 9, { bold: true, color: 'primary' });
    pdfTextAt(parts, `Estado: ${paymentStatusFor(order)}  |  Pedido: ${order.status}`, 40, infoTop - 18, 8, { color: 'dark' });
    pdfTextAt(parts, `Forma de pago: ${order.paymentMethod || 'No definida'}`, 40, infoTop - 33, 8, { color: 'dark' });
    pdfTextAt(parts, `Entrega: ${order.deliveryType || 'No definida'}`, 40, infoTop - 48, 8, { color: 'dark' });
    pdfTextAt(parts, `Elaboro: ${pdfShort(order.createdBy || '', 34)}`, 40, infoTop - 63, 8, { color: 'muted' });
    if (payments.length) {
      pdfTextAt(parts, `Abonos registrados: ${payments.length}`, 40, infoTop - 78, 8, { color: 'muted' });
      payments.slice(-2).forEach((payment, index) => pdfTextAt(parts, `${dateOnly(payment.createdAt)} - ${payment.method}: ${money(payment.amount)}`, 40, infoTop - 93 - index * 13, 7.5, { color: 'muted' }));
    }

    if (order.notes) {
      pdfTextAt(parts, 'OBSERVACIONES', 40, notesTop, 8, { bold: true, color: 'primary' });
      pdfTextAt(parts, pdfShort(order.notes, 92), 40, notesTop - 15, 7.5, { color: 'muted' });
    }
    if (s.bankInfo) {
      pdfTextAt(parts, 'DATOS DE PAGO', 40, notesTop - 34, 8, { bold: true, color: 'primary' });
      pdfTextAt(parts, pdfShort(s.bankInfo, 92), 40, notesTop - 48, 7.5, { color: 'muted' });
    }
  } else {
    pdfTextAt(parts, 'Continua en la siguiente pagina.', 555, 115, 8, { color: 'muted', align: 'right' });
  }

  pdfRule(parts, 40, 58, 555, 58, 'accent', 1.2);
  pdfTextAt(parts, s.footer || 'Gracias por su compra.', 40, 42, 8, { color: 'muted' });
  pdfTextAt(parts, `Pagina ${pageIndex + 1} de ${pageCount}`, 555, 42, 8, { color: 'muted', align: 'right' });
  return parts.join('\n');
}

function createOrderInvoiceBlob(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const pageSize = 11;
  const pages = [];
  for (let index = 0; index < Math.max(items.length, 1); index += pageSize) pages.push(items.slice(index, index + pageSize));
  return buildPdfFromPageStreams(pages.map((pageItems, pageIndex) => invoicePageStream(order, pageItems, pageIndex, pages.length)));
}

function buildOrderPdfLines(order) {
  const s=DB.settings, payments=DB.payments.filter(p=>p.orderId===order.id&&p.status!=='Anulado').sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  const lines=[
    {text:`${s.nit} | ${s.address} ${s.city||''} | ${s.phone}`,size:9,color:'muted'},
    {text:s.documentLabel||'FACTURA DE COMPRA',size:14,bold:true,color:'primary'},
    {text:`Pedido: ${order.number}`,size:11,bold:true,color:'primary2'},
    {text:`Fecha: ${dateTime(order.createdAt)}`,size:10},{text:`Vendedor: ${order.createdBy}`,size:10},{text:'',size:5},
    {text:`Cliente: ${order.clientName}`,size:11,bold:true,color:'primary'},
    {text:`Documento/NIT: ${order.clientDocument||''}`,size:10},{text:`WhatsApp: ${order.clientWhatsapp||''}`,size:10},
    {text:`Entrega: ${order.deliveryType} | ${order.clientAddress||''} ${order.clientCity||''}`,size:10},
    {text:`Estado pedido: ${order.status} | Estado pago: ${paymentStatusFor(order)}`,size:10},
    {text:`Vencimiento: ${order.dueDate?dateOnly(order.dueDate):'No aplica'}`,size:10},{text:'',size:6},
    {text:'CÓDIGO        PRODUCTO                              CANT.      PRECIO        TOTAL',size:9,bold:true,color:'primary'},
    {text:'--------------------------------------------------------------------------------',size:9,color:'muted'}
  ];
  (order.items||[]).forEach(item=>{ const name=String(item.name).slice(0,34); lines.push({text:`${pad(item.code,13)} ${pad(name,36)} ${pad(item.quantity,6,true)} ${pad(formatPlain(item.price),12,true)} ${pad(formatPlain(item.lineTotal),13,true)}`,size:8}); lines.push({text:`  Presentación: ${item.presentation||'—'}`,size:7,color:'muted'}); });
  lines.push({text:'--------------------------------------------------------------------------------',size:9,color:'muted'},{text:`Subtotal: ${money(order.subtotal)}`,size:10,align:'right'},{text:`Entrega: ${money(order.deliveryCost)}`,size:10,align:'right'});
  if(num(order.returnCredit)>0) lines.push({text:`Notas crédito/devoluciones: -${money(order.returnCredit)}`,size:10,align:'right'});
  lines.push({text:`TOTAL VIGENTE: ${money(orderEffectiveTotal(order))}`,size:14,bold:true,align:'right',color:'primary'},{text:`Pagado/abonado: ${money(order.paid)} | Saldo: ${money(order.balance)}`,size:10,align:'right',color:num(order.balance)>0?'accent':'primary2'});
  if(payments.length){ lines.push({text:'',size:4},{text:'HISTORIAL DE PAGOS',size:10,bold:true,color:'primary'}); payments.forEach(p=>lines.push({text:`${dateOnly(p.createdAt)} | ${p.number} | ${p.method} | ${money(p.amount)}${p.reference?` | Ref. ${p.reference}`:''}`,size:8})); }
  lines.push({text:'',size:5},{text:`Observaciones: ${order.notes||''}`,size:9},{text:'',size:8},{text:s.bankInfo?`Datos de pago: ${s.bankInfo}`:'',size:8,color:'muted'},{text:s.footer,size:8,color:'muted'});
  return lines.filter(x=>x.text!==''||x.size<=8);
}

function buildQuotePdfLines(quote) {
  const s=DB.settings;
  const lines=[
    {text:`${s.nit} | ${s.address} ${s.city||''} | ${s.phone}`,size:9,color:'muted'},
    {text:'COTIZACIÓN COMERCIAL',size:14,bold:true,color:'primary'},
    {text:`Cotización: ${quote.number}`,size:11,bold:true,color:'primary2'},
    {text:`Fecha: ${dateTime(quote.createdAt)} | Válida hasta: ${dateOnly(quote.validUntil)}`,size:10},
    {text:`Cliente: ${quote.clientName}`,size:11,bold:true,color:'primary'},{text:'',size:6},
    {text:'CÓDIGO        PRODUCTO                              CANT.      PRECIO        TOTAL',size:9,bold:true,color:'primary'},
    {text:'--------------------------------------------------------------------------------',size:9,color:'muted'}
  ];
  (quote.items||[]).forEach(item=>lines.push({text:`${pad(item.code,13)} ${pad(String(item.name).slice(0,34),36)} ${pad(item.quantity,6,true)} ${pad(formatPlain(item.price),12,true)} ${pad(formatPlain(item.lineTotal),13,true)}`,size:8}));
  lines.push({text:'--------------------------------------------------------------------------------',size:9,color:'muted'},{text:`TOTAL COTIZADO: ${money(quote.total)}`,size:14,bold:true,align:'right',color:'primary'},{text:'',size:5},{text:`Observaciones: ${quote.notes||'Sin observaciones'}`,size:9},{text:s.footer,size:8,color:'muted'}); return lines;
}

async function loadPdfBlobFromFirestore(pdfMeta) {
  if (!pdfMeta?.fileId || typeof Cloud === 'undefined' || !Cloud.user) return null;
  const result = await Cloud.readStoredFile(pdfMeta.fileId);
  return result.blob;
}

async function ensureOrderPdf(order) {
  if(!order.pdf) order.pdf={generated:false,version:1,layoutVersion:2,fileName:invoicePdfFileName(order,1),storage:'firestore-base64'};
  if(order.pdf.layoutVersion!==2){
    const version=num(order.pdf.version)+1||1;
    order.pdf={...order.pdf,generated:false,needsUpload:true,version,layoutVersion:2,fileName:invoicePdfFileName(order,version),storage:'firestore-base64'};
  }
  let blob=await pdfStoreGet(order.pdf.fileName);
  if(!blob && order.pdf.fileId){
    blob=await loadPdfBlobFromFirestore(order.pdf);
    if(blob) await pdfStorePut(order.pdf.fileName,blob);
  }
  if(!blob){ blob=createOrderInvoiceBlob(order); await pdfStorePut(order.pdf.fileName,blob); }
  order.pdf.generated=true;
  order.pdf.generatedAt=order.pdf.generatedAt||nowIso();
  if(typeof Cloud!=='undefined'&&Cloud.user&&Cloud.online&&(!order.pdf.fileId||order.pdf.needsUpload)){
    const uploaded=await Cloud.uploadPdf(blob,order,'pedidos');
    Object.assign(order.pdf,{fileId:uploaded.fileId,path:uploaded.path,layoutVersion:2,storage:'firestore-base64',needsUpload:false,uploadedAt:nowIso(),uploadedBy:currentUserEmail(),size:uploaded.size,chunkCount:uploaded.chunkCount});
    delete order.pdf.url;
  }
  saveDB();
  return blob;
}
async function ensureQuotePdf(quote) {
  if(!quote.pdf) quote.pdf={generated:false,version:1,fileName:`${quote.number}-V1.pdf`,storage:'firestore-base64'};
  let blob=await pdfStoreGet(quote.pdf.fileName);
  if(!blob && quote.pdf.fileId){
    blob=await loadPdfBlobFromFirestore(quote.pdf);
    if(blob) await pdfStorePut(quote.pdf.fileName,blob);
  }
  if(!blob){ blob=createPdfBlob(buildQuotePdfLines(quote)); await pdfStorePut(quote.pdf.fileName,blob); }
  quote.pdf.generated=true;
  quote.pdf.generatedAt=quote.pdf.generatedAt||nowIso();
  if(typeof Cloud!=='undefined'&&Cloud.user&&Cloud.online&&(!quote.pdf.fileId||quote.pdf.needsUpload)){
    const uploaded=await Cloud.uploadPdf(blob,quote,'cotizaciones');
    Object.assign(quote.pdf,{fileId:uploaded.fileId,path:uploaded.path,storage:'firestore-base64',needsUpload:false,uploadedAt:nowIso(),uploadedBy:currentUserEmail(),size:uploaded.size,chunkCount:uploaded.chunkCount});
    delete quote.pdf.url;
  }
  saveDB();
  return blob;
}
function downloadBlob(blob,fileName) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=fileName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); }
async function viewOrderPdf(orderId) { const order=orderById(orderId); if(!order) return toast('Pedido no encontrado.','danger'); try{ const blob=await ensureOrderPdf(order); const url=URL.createObjectURL(blob); window.open(url,'_blank','noopener'); setTimeout(()=>URL.revokeObjectURL(url),60000); }catch(error){console.error(error);toast('No se pudo abrir el PDF.','danger');} }
async function downloadOrderPdf(orderId) { const order=orderById(orderId); if(!order)return; try{const blob=await ensureOrderPdf(order);downloadBlob(blob,order.pdf.fileName);}catch(error){console.error(error);toast('No se pudo descargar el PDF.','danger');} }
async function viewQuotePdf(quoteId) { const quote=DB.quotes.find(q=>q.id===quoteId); if(!quote)return; try{const blob=await ensureQuotePdf(quote);const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){console.error(error);toast('No se pudo abrir la cotización.','danger');} }
async function shareDocumentWhatsApp(entity,type='order') {
  try {
    const isOrder=type==='order';
    const blob=isOrder?await ensureOrderPdf(entity):await ensureQuotePdf(entity);
    const fileName=entity.pdf.fileName;
    const total=isOrder?orderEffectiveTotal(entity):entity.total;
    const text=isOrder
      ?`Hola, ${entity.clientName}. Comercializadora MAR comparte la factura de compra ${entity.number}. Total: ${money(total)}. Saldo pendiente: ${money(entity.balance)}.`
      :`Hola, ${entity.clientName}. Comercializadora MAR comparte la cotización ${entity.number}. Total: ${money(total)}. Válida hasta ${dateOnly(entity.validUntil)}.`;
    const file=new File([blob],fileName,{type:'application/pdf'});
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({title:entity.number,text,files:[file]});
      toast('Documento preparado para compartir.','ok');
      return;
    }
    let phone=normalizePhone(entity.clientWhatsapp);
    if(phone&&phone.length===10)phone=`${DB.settings.whatsappCountryCode||'57'}${phone}`;
    downloadBlob(blob,fileName);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text+' El PDF fue descargado para adjuntarlo al mensaje.')}`,'_blank','noopener');
    toast('PDF descargado y WhatsApp abierto. Adjunta el archivo descargado.','ok');
  }catch(error){if(error?.name!=='AbortError'){console.error(error);toast('No se pudo preparar el envío.','danger');}}
}

function safeFilePart(value){return String(value||'documento').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60)||'documento';}

function buildClientStatementLines(client){
  const pending=DB.orders.filter(order=>order.clientId===client.id&&order.balance>0&&!['Cancelado','Borrador','Convertido'].includes(order.status)).sort((a,b)=>String(a.dueDate||a.createdAt).localeCompare(String(b.dueDate||b.createdAt)));
  const payments=DB.payments.filter(payment=>payment.clientId===client.id&&payment.status!=='Anulado').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,12);
  const lines=[
    {text:`${DB.settings.nit} | ${DB.settings.address} ${DB.settings.city||''} | ${DB.settings.phone}`,size:9,color:'muted'},
    {text:'ESTADO DE CUENTA',size:15,bold:true,color:'primary'},
    {text:`Cliente: ${client.businessName}`,size:12,bold:true,color:'primary2'},
    {text:`NIT/Documento: ${client.document||'No registrado'} | Fecha: ${dateOnly(todayKey())}`,size:10},
    {text:`Cupo: ${money(client.creditLimit)} | Saldo total: ${money(client.currentBalance)}`,size:10,bold:true},
    {text:'',size:5},{text:'PEDIDOS PENDIENTES',size:10,bold:true,color:'primary'},
    {text:'PEDIDO          FECHA          VENCE          ESTADO             SALDO',size:9,bold:true,color:'primary'},
    {text:'--------------------------------------------------------------------------------',size:9,color:'muted'}
  ];
  if(pending.length) pending.forEach(order=>lines.push({text:`${pad(order.number,15)} ${pad(dateOnly(order.createdAt),14)} ${pad(order.dueDate?dateOnly(order.dueDate):'—',14)} ${pad(paymentStatusFor(order),18)} ${pad(formatPlain(order.balance),13,true)}`,size:8}));
  else lines.push({text:'No existen pedidos con saldo pendiente.',size:9});
  lines.push({text:'--------------------------------------------------------------------------------',size:9,color:'muted'},{text:`SALDO TOTAL: ${money(client.currentBalance)}`,size:14,bold:true,align:'right',color:'primary'});
  if(payments.length){lines.push({text:'',size:5},{text:'ÚLTIMOS PAGOS Y ABONOS',size:10,bold:true,color:'primary'});payments.forEach(payment=>lines.push({text:`${dateOnly(payment.createdAt)} | ${payment.number} | ${payment.orderNumber} | ${payment.method} | ${money(payment.amount)}`,size:8}));}
  lines.push({text:'',size:6},{text:DB.settings.bankInfo?`Datos de pago: ${DB.settings.bankInfo}`:'',size:8,color:'muted'},{text:DB.settings.footer,size:8,color:'muted'});
  return lines.filter(line=>line.text!==''||line.size<=8);
}

async function createClientStatementDocument(client){
  const fileName=`ESTADO_CUENTA_${safeFilePart(client.businessName)}_${todayKey()}.pdf`;
  const blob=createPdfBlob(buildClientStatementLines(client));
  let fileId='',path='';
  if(typeof Cloud!=='undefined'&&Cloud.user&&Cloud.online){
    const entity={id:client.id,number:`ESTADO-${client.code||client.id}`,createdAt:nowIso(),pdf:{fileName,version:1}};
    const uploaded=await Cloud.uploadPdf(blob,entity,'estados-cuenta');fileId=uploaded.fileId;path=uploaded.path;
  }
  return {blob,fileName,fileId,path};
}

async function viewClientStatementPdf(clientId){
  const client=clientById(clientId);if(!client)return;
  try{const doc=await createClientStatementDocument(client);const url=URL.createObjectURL(doc.blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){console.error(error);toast('No se pudo generar el estado de cuenta.','danger');}
}

async function shareClientStatementWhatsApp(clientId){
  const client=clientById(clientId);if(!client)return;
  try{
    const doc=await createClientStatementDocument(client),file=new File([doc.blob],doc.fileName,{type:'application/pdf'});
    const text=`Hola, ${client.businessName}. Comercializadora MAR comparte su estado de cuenta. Saldo actual: ${money(client.currentBalance)}.`;
    if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:'Estado de cuenta',text,files:[file]});return;}
    let phone=normalizePhone(client.whatsapp||client.phone);if(phone.length===10)phone=`${DB.settings.whatsappCountryCode||'57'}${phone}`;
    downloadBlob(doc.blob,doc.fileName);window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text+' El PDF fue descargado para adjuntarlo.')}`,'_blank','noopener');
  }catch(error){if(error?.name!=='AbortError'){console.error(error);toast('No se pudo compartir el estado de cuenta.','danger');}}
}

function buildPaymentReceiptLines(payment,order){
  const client=clientById(payment.clientId);
  return [
    {text:`${DB.settings.nit} | ${DB.settings.address} ${DB.settings.city||''} | ${DB.settings.phone}`,size:9,color:'muted'},
    {text:'RECIBO DE PAGO / ABONO',size:15,bold:true,color:'primary'},
    {text:`Recibo: ${payment.number}`,size:11,bold:true,color:'primary2'},
    {text:`Fecha: ${dateTime(payment.createdAt)}`,size:10},{text:`Cliente: ${payment.clientName}`,size:11,bold:true},
    {text:`NIT/Documento: ${client?.document||'No registrado'}`,size:10},{text:`Pedido aplicado: ${payment.orderNumber}`,size:10},
    {text:'',size:8},{text:`VALOR RECIBIDO: ${money(payment.amount)}`,size:17,bold:true,color:'primary'},
    {text:`Método: ${payment.method}`,size:10},{text:`Referencia: ${payment.reference||'No registrada'}`,size:10},
    {text:`Saldo restante del pedido: ${money(order?.balance||0)}`,size:11,bold:true,color:'accent'},
    {text:`Observaciones: ${payment.notes||'Sin observaciones'}`,size:9},{text:'',size:8},
    {text:`Recibido por: ${payment.createdBy}`,size:9},{text:DB.settings.footer,size:8,color:'muted'}
  ];
}

async function createPaymentReceiptDocument(payment){
  const order=orderById(payment.orderId),fileName=`RECIBO_${payment.number}.pdf`,blob=createPdfBlob(buildPaymentReceiptLines(payment,order));
  let fileId='';
  if(typeof Cloud!=='undefined'&&Cloud.user&&Cloud.online){const entity={id:payment.id,number:payment.number,createdAt:payment.createdAt,pdf:{fileName,version:1}};const uploaded=await Cloud.uploadPdf(blob,entity,'recibos');fileId=uploaded.fileId;}
  return {blob,fileName,fileId,order};
}

async function viewPaymentReceiptPdf(paymentId){const payment=DB.payments.find(item=>item.id===paymentId);if(!payment)return;try{const doc=await createPaymentReceiptDocument(payment);const url=URL.createObjectURL(doc.blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){console.error(error);toast('No se pudo generar el recibo.','danger');}}

async function sharePaymentReceiptWhatsApp(paymentId){
  const payment=DB.payments.find(item=>item.id===paymentId);if(!payment)return;
  try{const doc=await createPaymentReceiptDocument(payment),client=clientById(payment.clientId),file=new File([doc.blob],doc.fileName,{type:'application/pdf'}),text=`Hola, ${payment.clientName}. Confirmamos el pago/abono ${payment.number} por ${money(payment.amount)} aplicado al pedido ${payment.orderNumber}. Saldo restante: ${money(doc.order?.balance||0)}.`;if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:payment.number,text,files:[file]});return;}let phone=normalizePhone(client?.whatsapp||client?.phone);if(phone.length===10)phone=`${DB.settings.whatsappCountryCode||'57'}${phone}`;downloadBlob(doc.blob,doc.fileName);window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text+' El recibo fue descargado para adjuntarlo.')}`,'_blank','noopener');}catch(error){if(error?.name!=='AbortError'){console.error(error);toast('No se pudo compartir el recibo.','danger');}}
}
