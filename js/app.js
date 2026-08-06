'use strict';

function toast(message,type=''){const wrap=document.getElementById('toastWrap');const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;wrap.appendChild(el);setTimeout(()=>el.remove(),3800);}
function openModal(html, options = {}){const backdrop=document.getElementById('modalBackdrop');document.getElementById('modalCard').innerHTML=html;backdrop.dataset.locked=options.locked?'true':'false';backdrop.classList.remove('hidden');}
function closeModal(){const backdrop=document.getElementById('modalBackdrop');if(backdrop.dataset.locked==='true')return;backdrop.classList.add('hidden');backdrop.dataset.locked='false';document.getElementById('modalCard').innerHTML='';}
function forceCloseModal(){const backdrop=document.getElementById('modalBackdrop');backdrop.dataset.locked='false';backdrop.classList.add('hidden');document.getElementById('modalCard').innerHTML='';}
function safeSave(success='Cambios guardados.'){try{saveDB();if(success)toast(success,'ok');return true;}catch(error){toast(error.message||'No se pudo guardar.','danger');return false;}}
function bindCloseModal(){document.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));}
function bindGoButtons(){document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));}
function bindPagination(key,page){const map={orders:'orderPage',clients:'clientPage',products:'productPage',movements:'movementPage',quotes:'quotePage',returns:'returnPage',purchases:'purchasePage',suppliers:'supplierPage',dispatches:'dispatchPage',portfolio:'portfolioPage'};document.querySelectorAll(`[data-page-key="${key}"]`).forEach(btn=>btn.addEventListener('click',()=>{const next=Number(btn.dataset.page);if(next<1||next>page.pages)return;if(map[key])ui[map[key]]=next;renderRoute();}));}

function boot(){bindBaseEvents();const session=currentUser();if(session)showApp();else showLogin();}
function bindBaseEvents(){
  document.getElementById('loginForm').addEventListener('submit',handleLogin);
  document.getElementById('loginPasswordToggle').addEventListener('click',()=>{const input=document.getElementById('loginPassword');input.type=input.type==='password'?'text':'password';document.getElementById('loginPasswordToggle').textContent=input.type==='password'?'👁️ Ver':'🙈 Ocultar';});
  document.getElementById('logoutButton').addEventListener('click',logout);
  document.getElementById('mobileMenuButton').addEventListener('click',()=>toggleMenu(true));
  document.getElementById('desktopSidebarToggle').addEventListener('click',toggleSidebarDesktop);
  document.getElementById('overlay').addEventListener('click',()=>toggleMenu(false));
  document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
}
function handleLogin(event){event.preventDefault();const email=document.getElementById('loginEmail').value.trim().toLowerCase();const password=document.getElementById('loginPassword').value;const user=DB.users.find(u=>u.email.toLowerCase()===email&&u.password===password&&u.status==='Activo');const message=document.getElementById('loginMessage');if(!user){message.textContent='Correo, contraseña o estado de usuario incorrecto.';return;}sessionStorage.setItem(SESSION_KEY,JSON.stringify({userId:user.id,startedAt:nowIso()}));message.textContent='';ui.route='dashboard';showApp();}
function showLogin(){document.getElementById('loginScreen').classList.remove('hidden');document.getElementById('app').classList.add('auth-hidden');}
function showApp(){document.getElementById('loginScreen').classList.add('hidden');document.getElementById('app').classList.remove('auth-hidden');applySidebarState();renderSession();renderMenu();navigate(can(ui.route)?ui.route:'dashboard');}
function logout(){sessionStorage.removeItem(SESSION_KEY);showLogin();}
function renderSession(){const u=currentUser();document.getElementById('userSession').textContent=`${u?.name||'Usuario'} · ${u?.role||''}`;document.getElementById('syncStatus').textContent='● Datos locales protegidos';document.getElementById('brandName').textContent=DB.settings.businessName||'Comercializadora MAR';}
function toggleMenu(open){document.getElementById('sidebar').classList.toggle('open',open);document.getElementById('overlay').classList.toggle('show',open);}
function toggleSidebarDesktop(){ui.sidebarCollapsed=!ui.sidebarCollapsed;localStorage.setItem(SIDEBAR_KEY,ui.sidebarCollapsed?'1':'0');applySidebarState();}
function applySidebarState(){document.getElementById('app').classList.toggle('sidebar-collapsed',ui.sidebarCollapsed);}
function renderMenu(){document.getElementById('menu').innerHTML=MENU.map(group=>{const items=group.items.filter(([route])=>can(route));if(!items.length)return'';return `<div class="menu-section">${esc(group.section)}</div>${items.map(([route,label,icon])=>`<button class="nav-btn ${ui.route===route?'active':''}" data-route="${route}"><span class="nav-icon">${icon}</span><span class="nav-label">${esc(label)}</span></button>`).join('')}`;}).join('');document.querySelectorAll('[data-route]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.route)));}
function navigate(route){ui.route=can(route)&&TITLES[route]?route:'dashboard';document.getElementById('pageTitle').textContent=TITLES[ui.route];document.getElementById('pageSubtitle').innerHTML=`<span class="tiny muted">${esc(currentRole())}</span>`;renderMenu();toggleMenu(false);renderRoute();window.scrollTo({top:0,behavior:'smooth'});}
function renderRoute(){const map={dashboard:renderDashboard,orderNew:renderOrderNew,orders:renderOrders,quotes:renderQuotes,returns:renderReturns,clients:renderClients,portfolio:renderPortfolio,products:renderProducts,movements:renderMovements,purchases:renderPurchases,suppliers:renderSuppliers,dispatches:renderDispatches,cash:renderCash,reports:renderReports,users:renderUsers,settings:renderSettings};(map[ui.route]||renderDashboard)();}

function aggregateTopProducts(orders=DB.orders){const map=new Map();orders.filter(o=>!['Cancelado','Borrador','Convertido'].includes(o.status)).forEach(o=>(o.items||[]).forEach(i=>{const x=map.get(i.productId)||{name:i.name,quantity:0,value:0};x.quantity+=num(i.quantity);x.value+=num(i.lineTotal);map.set(i.productId,x);}));return [...map.values()].sort((a,b)=>b.quantity-a.quantity);}
function renderDashboard(){
  const today=todayKey();const activeOrders=DB.orders.filter(o=>!['Cancelado','Borrador','Convertido'].includes(o.status));const todayOrders=activeOrders.filter(o=>String(o.createdAt).slice(0,10)===today);const todaySales=todayOrders.reduce((s,o)=>s+orderEffectiveTotal(o),0);const pending=activeOrders.filter(o=>!['Entregado'].includes(o.status)).length;const low=DB.products.filter(p=>num(p.stock)<=num(p.minStock)).length;const receivable=activeOrders.reduce((s,o)=>s+num(o.balance),0);const overdue=activeOrders.filter(o=>paymentStatusFor(o)==='Vencido').reduce((s,o)=>s+num(o.balance),0);const recent=activeOrders.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,6);const frequent=aggregateTopProducts().slice(0,6);
  document.getElementById('view').innerHTML=`<div class="grid grid-4">${statCard('Ventas de hoy',money(todaySales),'💰')}${statCard('Pedidos por completar',pending,'📦')}${statCard('Cartera pendiente',money(receivable),'💳',overdue?`Vencida: ${money(overdue)}`:'Sin cartera vencida')}${statCard('Stock bajo',low,'⚠️')}</div>
  <div class="grid grid-2" style="margin-top:16px"><div class="card"><div class="section-title"><div><h2>Pedidos recientes</h2><p>Estado operativo y pago por separado.</p></div>${can('orders')?'<button class="btn btn-outline btn-sm" data-go="orders">Ver todos</button>':''}</div>${recent.length?`<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Despacho</th><th>Pago</th><th class="money">Saldo</th></tr></thead><tbody>${recent.map(o=>`<tr><td><b>${esc(o.number)}</b><div class="tiny muted">${dateTime(o.createdAt)}</div></td><td>${esc(o.clientName)}</td><td>${statusBadge(o.status)}</td><td>${paymentBadge(paymentStatusFor(o))}</td><td class="money"><b>${money(o.balance)}</b></td></tr>`).join('')}</tbody></table></div>`:emptyState('Todavía no hay pedidos.')}</div>
  <div class="card"><div class="section-title"><div><h2>Productos más solicitados</h2><p>Acumulado de pedidos vigentes.</p></div></div>${frequent.length?frequent.map((x,i)=>`<div class="summary-row"><span>${i+1}. ${esc(x.name)}</span><b>${x.quantity} und.</b></div>`).join(''):emptyState('Se mostrará información al registrar pedidos.')}</div></div>
  <div class="card" style="margin-top:16px"><div class="section-title"><div><h2>Acciones rápidas</h2><p>Accesos según tu rol.</p></div></div><div class="actions">${can('orderNew')?'<button class="btn btn-primary" data-go="orderNew">📦 Crear pedido</button>':''}${can('clients')?'<button class="btn btn-secondary" data-go="clients">👥 Registrar cliente</button>':''}${can('portfolio')?'<button class="btn btn-secondary" data-go="portfolio">💳 Revisar cartera</button>':''}${can('purchases')?'<button class="btn btn-secondary" data-go="purchases">🛒 Registrar compra</button>':''}</div></div>`;bindGoButtons();}

function clientOrderSummary(client){if(!client)return'';const available=Math.max(0,num(client.creditLimit)-num(client.currentBalance));const orders=DB.orders.filter(o=>o.clientId===client.id&&o.status!=='Cancelado');const last=orders.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];return `<div class="client-summary"><div class="mini-stat"><span>Tipo</span><b>${esc(client.type)}</b></div><div class="mini-stat"><span>Lista</span><b>${esc(priceListLabel(client.priceList))}</b></div><div class="mini-stat"><span>Cupo disponible</span><b>${money(available)}</b></div><div class="mini-stat"><span>Último pedido</span><b>${last?dateOnly(last.createdAt):'Sin pedidos'}</b></div></div>${client.notes?`<div class="notice" style="margin-top:12px"><b>Nota comercial:</b> ${esc(client.notes)}</div>`:''}`;}
function productOptions(client){const list=client?.priceList||'general';return DB.products.filter(p=>p.status==='Activo').sort((a,b)=>a.name.localeCompare(b.name)).map(p=>`<option value="${p.id}">${esc(p.code)} · ${esc(p.name)} · ${money(p.prices?.[list]??p.prices?.general)} · Stock ${num(p.stock)}</option>`).join('');}
function orderSubtotal(){return ui.orderCart.reduce((s,i)=>s+num(i.price)*num(i.quantity),0);}
function currentDeliveryCost(){return num(document.getElementById('orderDeliveryCost')?.value);}
function renderOrderTotals(){const subtotal=orderSubtotal(),delivery=currentDeliveryCost();return `<div class="summary-row"><span>Subtotal</span><b>${money(subtotal)}</b></div><div class="summary-row"><span>Entrega</span><b>${money(delivery)}</b></div><div class="summary-row total"><span>Total</span><span>${money(subtotal+delivery)}</span></div>`;}
function renderOrderCart(){if(!ui.orderCart.length)return emptyState('Agrega productos al pedido.');return ui.orderCart.map(item=>`<div class="cart-item"><div class="cart-item-head"><div><div class="cart-item-title">${esc(item.name)}</div><div class="cart-meta">${esc(item.code)} · ${esc(item.presentation)} · Stock ${item.stock}</div></div><button class="btn btn-danger btn-sm" data-remove-cart="${item.productId}">Quitar</button></div><div class="cart-item-foot"><div class="qty-control"><button data-qty="-1" data-product="${item.productId}">−</button><input class="input" type="number" min="1" max="${item.stock}" value="${item.quantity}" data-qty-input="${item.productId}"><button data-qty="1" data-product="${item.productId}">＋</button></div><b>${money(item.price*item.quantity)}</b></div></div>`).join('');}
function refreshCart(){document.getElementById('orderCartList').innerHTML=renderOrderCart();document.getElementById('orderTotals').innerHTML=renderOrderTotals();document.getElementById('cartCount').textContent=`${ui.orderCart.length} productos`;bindCartEvents();}
function renderOrderNew(){
  const client=clientById(ui.selectedClientId)||DB.clients.find(c=>c.status==='Activo')||DB.clients[0];ui.selectedClientId=client?.id||'';
  document.getElementById('view').innerHTML=`<div class="split-layout"><div class="grid"><div class="card"><div class="section-title"><div><h2>1. Cliente comercial</h2><p>Carga automáticamente precios, crédito y datos de entrega.</p></div><button class="btn btn-outline btn-sm" id="quickClientButton">＋ Nuevo cliente</button></div><div class="field"><label>Cliente</label><select class="select" id="orderClient">${DB.clients.filter(c=>c.status==='Activo').map(c=>`<option value="${c.id}" ${c.id===ui.selectedClientId?'selected':''}>${esc(c.businessName)} · ${esc(priceListLabel(c.priceList))}</option>`).join('')}</select></div><div id="clientOrderSummary">${clientOrderSummary(client)}</div></div>
  <div class="card"><div class="section-title"><div><h2>2. Productos</h2><p>Busca por código, marca, viscosidad o categoría.</p></div></div><div class="product-picker"><div class="field"><label>Producto</label><select class="select" id="orderProduct">${productOptions(client)}</select></div><div class="field"><label>Cantidad</label><input class="input" id="orderQuantity" type="number" min="1" step="1" value="1"></div><div class="field add-col"><label>&nbsp;</label><button class="btn btn-primary" id="addOrderProduct">＋ Agregar</button></div></div><div class="notice warn" style="margin-top:14px">No se confirma una cantidad superior al inventario disponible.</div></div>
  <div class="card"><div class="section-title"><div><h2>3. Pago, vencimiento y entrega</h2><p>El pago inicial puede ser cero, parcial o total.</p></div></div><div class="form-grid"><div class="field"><label>Forma de pago</label><select class="select" id="orderPayment"><option>Contado</option><option>Transferencia</option><option>Crédito</option><option>Pago combinado</option></select></div><div class="field"><label>Valor pagado o abonado</label><input class="input" id="orderPaid" type="number" min="0" step="1000" value="0"></div><div class="field"><label>Fecha de vencimiento</label><input class="input" id="orderDueDate" type="date"></div><div class="field"><label>Tipo de entrega</label><select class="select" id="orderDelivery"><option>Recoge en bodega</option><option>Domicilio</option><option>Envío a negocio</option><option>Entrega por ruta</option></select></div><div class="field hidden" id="deliveryCostField"><label>Costo de entrega</label><input class="input" id="orderDeliveryCost" type="number" min="0" step="1000" value="${num(DB.settings.defaultDeliveryCost)}"></div><div class="field full"><label>Observaciones</label><textarea class="textarea" id="orderNotes" placeholder="Indicaciones de despacho, referencias o condiciones acordadas"></textarea></div></div></div></div>
  <aside class="card sticky"><div class="section-title"><div><h2>Resumen del pedido</h2><p id="cartCount">${ui.orderCart.length} productos</p></div><button class="btn btn-danger btn-sm" id="clearCart">Limpiar</button></div><div class="cart-list" id="orderCartList">${renderOrderCart()}</div><div class="summary-box" id="orderTotals" style="margin-top:14px">${renderOrderTotals()}</div><div class="grid" style="margin-top:14px"><button class="btn btn-primary" id="confirmOrder">✅ Confirmar y generar factura</button><button class="btn btn-secondary" id="saveDraft">💾 Guardar borrador</button><button class="btn btn-outline" id="saveQuote">🧾 Guardar como cotización</button></div></aside></div>`;
  const due=new Date();due.setDate(due.getDate()+num(client?.creditDays));document.getElementById('orderDueDate').value=client?.creditDays?due.toISOString().slice(0,10):'';bindOrderEvents();}
function bindOrderEvents(){
  document.getElementById('orderClient').addEventListener('change',e=>{ui.selectedClientId=e.target.value;ui.orderCart=[];renderOrderNew();});
  document.getElementById('quickClientButton').addEventListener('click',()=>openClientForm(true));
  document.getElementById('addOrderProduct').addEventListener('click',addOrderProduct);
  document.getElementById('orderDeliveryCost').addEventListener('input',()=>document.getElementById('orderTotals').innerHTML=renderOrderTotals());
  document.getElementById('orderDelivery').addEventListener('change',e=>{const hidden=e.target.value==='Recoge en bodega';document.getElementById('deliveryCostField').classList.toggle('hidden',hidden);if(hidden)document.getElementById('orderDeliveryCost').value='0';document.getElementById('orderTotals').innerHTML=renderOrderTotals();});
  document.getElementById('clearCart').addEventListener('click',()=>{ui.orderCart=[];refreshCart();});
  document.getElementById('confirmOrder').addEventListener('click',confirmOrder);
  document.getElementById('saveDraft').addEventListener('click',saveOrderDraft);
  document.getElementById('saveQuote').addEventListener('click',saveQuoteFromCurrent);
  bindCartEvents();
}
function bindCartEvents(){document.querySelectorAll('[data-remove-cart]').forEach(b=>b.addEventListener('click',()=>{ui.orderCart=ui.orderCart.filter(x=>x.productId!==b.dataset.removeCart);refreshCart();}));document.querySelectorAll('[data-qty]').forEach(b=>b.addEventListener('click',()=>changeCartQty(b.dataset.product,Number(b.dataset.qty))));document.querySelectorAll('[data-qty-input]').forEach(i=>i.addEventListener('change',()=>setCartQty(i.dataset.qtyInput,i.value)));}
function addOrderProduct(){const product=productById(document.getElementById('orderProduct').value),client=clientById(ui.selectedClientId),quantity=Math.floor(num(document.getElementById('orderQuantity').value));if(!product||quantity<1)return toast('Selecciona producto y cantidad válida.','warn');const existing=ui.orderCart.find(x=>x.productId===product.id),totalQty=quantity+num(existing?.quantity);if(totalQty>num(product.stock))return toast(`Solo hay ${product.stock} unidades disponibles.`,'danger');const price=num(product.prices?.[client?.priceList]??product.prices?.general);if(existing)existing.quantity=totalQty;else ui.orderCart.push({productId:product.id,code:product.code,name:product.name,presentation:product.presentation,quantity,price,stock:num(product.stock),costSnapshot:num(product.cost)});document.getElementById('orderQuantity').value='1';refreshCart();}
function changeCartQty(productId,delta){const item=ui.orderCart.find(x=>x.productId===productId);if(item)setCartQty(productId,num(item.quantity)+delta);}
function setCartQty(productId,value){const item=ui.orderCart.find(x=>x.productId===productId);if(!item)return;const quantity=Math.floor(num(value));if(quantity<=0)ui.orderCart=ui.orderCart.filter(x=>x.productId!==productId);else if(quantity<=item.stock)item.quantity=quantity;else toast(`Máximo disponible: ${item.stock}.`,'warn');refreshCart();}
function validateOrderData(){const client=clientById(ui.selectedClientId);if(!client){toast('Selecciona un cliente.','danger');return null;}if(!ui.orderCart.length){toast('Agrega al menos un producto.','warn');return null;}for(const item of ui.orderCart){const p=productById(item.productId);if(!p||num(p.stock)<num(item.quantity)){toast(`Inventario insuficiente para ${item.name}.`,'danger');return null;}}const subtotal=orderSubtotal(),deliveryCost=currentDeliveryCost(),total=subtotal+deliveryCost,paid=Math.min(total,Math.max(0,num(document.getElementById('orderPaid').value)));if(document.getElementById('orderPayment').value==='Crédito'&&num(client.creditLimit)>0&&num(client.currentBalance)+total-paid>num(client.creditLimit)){toast('El pedido supera el cupo del cliente. Se guardará pendiente de aprobación.','warn');}return {client,subtotal,deliveryCost,total,paid};}
async function confirmOrder(){const data=validateOrderData();if(!data)return;const {client,subtotal,deliveryCost,total,paid}=data,number=nextNumber('orders','PED');const projectedBalance=num(client.currentBalance)+total-paid;const status=num(client.creditLimit)>0&&projectedBalance>num(client.creditLimit)?'Pendiente de aprobación':'Confirmado';const order={id:id('ord'),number,clientId:client.id,clientName:client.businessName,clientDocument:client.document||'',clientWhatsapp:client.whatsapp||client.phone||'',clientAddress:client.address||'',clientCity:client.city||'',priceList:client.priceList,paymentMethod:document.getElementById('orderPayment').value,dueDate:document.getElementById('orderDueDate').value,deliveryType:document.getElementById('orderDelivery').value,deliveryCost,notes:document.getElementById('orderNotes').value.trim(),items:ui.orderCart.map(x=>({...x,lineTotal:num(x.price)*num(x.quantity)})),subtotal,discount:0,tax:0,total,paid:0,balance:total,returnCredit:0,status,paymentStatus:'Pendiente',assignedTo:'',dispatchDate:'',pdf:{generated:false,version:1,fileName:`FACTURA_COMPRA_${number}-V1.pdf`,layoutVersion:2,storage:'indexeddb'},createdAt:nowIso(),updatedAt:nowIso(),createdBy:currentUserEmail()};
  order.items.forEach(item=>{const product=productById(item.productId),before=num(product.stock);product.stock=before-num(item.quantity);product.updatedAt=nowIso();DB.inventoryMovements.unshift({id:id('mov'),type:'Salida por pedido',productId:product.id,productCode:product.code,productName:product.name,quantity:-num(item.quantity),stockBefore:before,stockAfter:product.stock,reference:number,createdAt:nowIso(),createdBy:currentUserEmail()});});
  DB.orders.unshift(order);if(paid>0)createPaymentRecord(order,paid,order.paymentMethod,'Pago inicial','Registrado al crear el pedido');updateOrderFinancials(order);recalcClientBalance(client.id);audit('CREAR','Pedido',order.id,number);if(!safeSave('Pedido creado correctamente.'))return;try{await ensureOrderPdf(order);}catch(error){console.error(error);toast('Pedido guardado; la factura se regenerará al abrirla.','warn');}ui.orderCart=[];showOrderSuccess(order);renderOrderNew();}
function createPaymentRecord(order,amount,method,reference='',notes=''){const payment={id:id('pay'),number:nextNumber('payments','PAG'),orderId:order.id,orderNumber:order.number,clientId:order.clientId,clientName:order.clientName,amount:num(amount),method,reference,notes,status:'Aplicado',createdAt:nowIso(),createdBy:currentUserEmail()};DB.payments.unshift(payment);audit('REGISTRAR','Pago',payment.id,`${payment.number} · ${order.number}`);return payment;}
function showOrderSuccess(order){openModal(`<div class="modal-head"><div><div class="success-icon">✓</div><h2>Pedido creado correctamente</h2><p class="muted">La factura incluye el pago inicial y el saldo vigente.</p></div><button class="modal-close" data-close-modal>×</button></div><div class="summary-box"><div class="summary-row"><span>Pedido</span><b>${esc(order.number)}</b></div><div class="summary-row"><span>Cliente</span><b>${esc(order.clientName)}</b></div><div class="summary-row"><span>Estado de pago</span><b>${esc(paymentStatusFor(order))}</b></div><div class="summary-row"><span>Saldo</span><b>${money(order.balance)}</b></div><div class="summary-row total"><span>Total</span><span>${money(orderEffectiveTotal(order))}</span></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-success" data-wa-order="${order.id}">🟢 Enviar factura por WhatsApp</button><button class="btn btn-info" data-view-pdf="${order.id}">👁 Ver factura</button><button class="btn btn-secondary" data-download-pdf="${order.id}">⬇ Descargar</button>${order.balance>0?`<button class="btn btn-warning" data-pay-order="${order.id}">💳 Registrar abono</button>`:''}</div>`);bindCloseModal();document.querySelector('[data-wa-order]')?.addEventListener('click',()=>shareDocumentWhatsApp(order,'order'));document.querySelector('[data-view-pdf]')?.addEventListener('click',()=>viewOrderPdf(order.id));document.querySelector('[data-download-pdf]')?.addEventListener('click',()=>downloadOrderPdf(order.id));document.querySelector('[data-pay-order]')?.addEventListener('click',()=>openPaymentModal(order.id));}
function saveQuoteFromCurrent(){const data=validateOrderData();if(!data)return;const {client,subtotal,deliveryCost,total}=data,number=nextNumber('quotes','COT'),valid=new Date();valid.setDate(valid.getDate()+15);const quote={id:id('quo'),number,clientId:client.id,clientName:client.businessName,clientWhatsapp:client.whatsapp||client.phone||'',items:ui.orderCart.map(x=>({...x,lineTotal:num(x.price)*num(x.quantity)})),subtotal,deliveryCost,total,notes:document.getElementById('orderNotes').value.trim(),validUntil:valid.toISOString().slice(0,10),status:'Pendiente',pdf:{generated:false,version:1,fileName:`${number}-V1.pdf`,storage:'indexeddb'},createdAt:nowIso(),createdBy:currentUserEmail()};DB.quotes.unshift(quote);audit('CREAR','Cotización',quote.id,number);if(safeSave('Cotización guardada.')){ui.orderCart=[];navigate('quotes');}}

function renderOrders(){const filter=ui.orderFilter.toLowerCase();const all=DB.orders.filter(o=>!filter||[o.number,o.clientName,o.status,paymentStatusFor(o)].some(x=>String(x).toLowerCase().includes(filter))).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const page=paginate(all,ui.orderPage);ui.orderPage=page.page;document.getElementById('view').innerHTML=`<div class="card"><div class="section-title"><div><h2>Historial de pedidos</h2><p>Registra abonos, confirma pagos, controla el despacho y comparte la factura actualizada.</p></div><button class="btn btn-primary" data-go="orderNew">＋ Nuevo pedido</button></div><div class="toolbar"><input class="input search" id="orderSearch" placeholder="Buscar pedido, cliente, despacho o pago" value="${esc(ui.orderFilter)}"><span class="pill">${all.length} pedidos · 10 por página</span></div>${page.items.length?`<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Despacho</th><th>Pago</th><th class="money">Total</th><th class="money">Saldo</th><th>Acciones</th></tr></thead><tbody>${page.items.map(o=>`<tr><td><b>${esc(o.number)}</b><div class="tiny muted">${dateTime(o.createdAt)}</div></td><td><b>${esc(o.clientName)}</b><div class="tiny muted">Vence ${o.dueDate?dateOnly(o.dueDate):'—'}</div></td><td>${statusBadge(o.status)}</td><td>${paymentBadge(paymentStatusFor(o))}<div class="tiny muted">Pagado ${money(o.paid)}</div></td><td class="money"><b>${money(orderEffectiveTotal(o))}</b></td><td class="money"><b>${money(o.balance)}</b></td><td><div class="actions"><button class="btn btn-info btn-sm" data-detail-order="${o.id}">Ver</button>${o.balance>0&&o.status!=='Cancelado'?`<button class="btn btn-warning btn-sm" data-pay-order="${o.id}">Abono</button>`:''}<button class="btn btn-success btn-sm" data-wa-order="${o.id}">WhatsApp</button><button class="btn btn-secondary btn-sm" data-repeat-order="${o.id}">Repetir</button></div></td></tr>`).join('')}</tbody></table></div>${paginationHtml(page,'orders')}`:emptyState('No hay pedidos que coincidan con la búsqueda.')}</div>`;bindGoButtons();document.getElementById('orderSearch').addEventListener('input',e=>{ui.orderFilter=e.target.value;ui.orderPage=1;renderOrders();});bindPagination('orders',page);document.querySelectorAll('[data-detail-order]').forEach(b=>b.addEventListener('click',()=>viewOrderDetail(b.dataset.detailOrder)));document.querySelectorAll('[data-pay-order]').forEach(b=>b.addEventListener('click',()=>openPaymentModal(b.dataset.payOrder)));document.querySelectorAll('[data-wa-order]').forEach(b=>b.addEventListener('click',()=>shareDocumentWhatsApp(orderById(b.dataset.waOrder),'order')));document.querySelectorAll('[data-repeat-order]').forEach(b=>b.addEventListener('click',()=>repeatOrder(b.dataset.repeatOrder)));}
function repeatOrder(orderId){const order=orderById(orderId);if(!order)return;ui.selectedClientId=order.clientId;ui.orderCart=(order.items||[]).map(item=>{const p=productById(item.productId);return {...item,stock:num(p?.stock),quantity:Math.min(num(item.quantity),num(p?.stock)),price:num(p?.prices?.[clientById(order.clientId)?.priceList]??item.price)};}).filter(i=>i.quantity>0);navigate('orderNew');toast('Pedido anterior cargado. Revisa cantidades y precios.','ok');}
function viewOrderDetail(orderId){const o=orderById(orderId);if(!o)return;const payments=DB.payments.filter(p=>p.orderId===o.id&&p.status!=='Anulado').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const returns=DB.returns.filter(r=>r.orderId===o.id&&r.status!=='Anulada');openModal(`<div class="modal-head"><div><h2>${esc(o.number)}</h2><p class="muted">${esc(o.clientName)} · ${dateTime(o.createdAt)}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="grid grid-3"><div class="mini-stat"><span>Despacho</span><b>${esc(o.status)}</b></div><div class="mini-stat"><span>Pago</span><b>${esc(paymentStatusFor(o))}</b></div><div class="mini-stat"><span>Saldo</span><b>${money(o.balance)}</b></div></div><div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Producto</th><th>Cantidad</th><th class="money">Precio</th><th class="money">Total</th></tr></thead><tbody>${(o.items||[]).map(i=>`<tr><td><b>${esc(i.name)}</b><div class="tiny muted">${esc(i.code)} · ${esc(i.presentation)}</div></td><td>${num(i.quantity)}</td><td class="money">${money(i.price)}</td><td class="money"><b>${money(i.lineTotal)}</b></td></tr>`).join('')}</tbody></table></div><div class="grid grid-2" style="margin-top:14px"><div class="card soft"><h3>Pagos y abonos</h3>${payments.length?payments.map(p=>`<div class="summary-row"><span>${dateOnly(p.createdAt)} · ${esc(p.method)}<div class="tiny muted">${esc(p.reference||p.number)}</div></span><b>${money(p.amount)}</b></div>`).join(''):emptyState('Sin pagos registrados.')}</div><div class="summary-box"><div class="summary-row"><span>Total original</span><b>${money(o.total)}</b></div><div class="summary-row"><span>Devoluciones</span><b>-${money(o.returnCredit)}</b></div><div class="summary-row"><span>Pagado</span><b>${money(o.paid)}</b></div><div class="summary-row total"><span>Saldo</span><span>${money(o.balance)}</span></div></div></div>${returns.length?`<div class="notice warn" style="margin-top:14px">Este pedido tiene ${returns.length} devolución(es) por ${money(o.returnCredit)}.</div>`:''}<div class="actions" style="margin-top:16px">${o.balance>0&&o.status!=='Cancelado'?`<button class="btn btn-warning" data-pay-detail="${o.id}">💳 Registrar abono</button>`:''}<button class="btn btn-info" data-status-detail="${o.id}">🚚 Cambiar estado</button><button class="btn btn-success" data-wa-detail="${o.id}">🟢 WhatsApp</button><button class="btn btn-secondary" data-pdf-detail="${o.id}">Ver factura</button>${o.status!=='Cancelado'?`<button class="btn btn-danger" data-cancel-detail="${o.id}">Cancelar pedido</button>`:''}</div>`);bindCloseModal();document.querySelector('[data-pay-detail]')?.addEventListener('click',()=>openPaymentModal(o.id));document.querySelector('[data-status-detail]')?.addEventListener('click',()=>openOrderStatusModal(o.id));document.querySelector('[data-wa-detail]')?.addEventListener('click',()=>shareDocumentWhatsApp(o,'order'));document.querySelector('[data-pdf-detail]')?.addEventListener('click',()=>viewOrderPdf(o.id));document.querySelector('[data-cancel-detail]')?.addEventListener('click',()=>cancelOrder(o.id));}
function openPaymentModal(orderId){const o=orderById(orderId);if(!o||o.balance<=0)return toast('El pedido no tiene saldo pendiente.','warn');openModal(`<div class="modal-head"><div><h2>Registrar pago o abono</h2><p class="muted">${esc(o.number)} · ${esc(o.clientName)}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="summary-box"><div class="summary-row"><span>Total vigente</span><b>${money(orderEffectiveTotal(o))}</b></div><div class="summary-row"><span>Pagado</span><b>${money(o.paid)}</b></div><div class="summary-row total"><span>Saldo</span><span>${money(o.balance)}</span></div></div><form id="paymentForm" style="margin-top:14px"><div class="form-grid"><div class="field"><label>Valor recibido *</label><input class="input" type="number" name="amount" min="1" max="${o.balance}" step="1000" value="${o.balance}" required></div><div class="field"><label>Método</label><select class="select" name="method"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Consignación</option><option>Pago combinado</option></select></div><div class="field"><label>Referencia</label><input class="input" name="reference" placeholder="Comprobante o número de transacción"></div><div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${todayKey()}"></div><div class="field full"><label>Observación</label><textarea class="textarea" name="notes"></textarea></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar pago</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();document.getElementById('paymentForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),amount=num(data.amount);if(amount<=0||amount>num(o.balance))return toast('El valor debe ser mayor a cero y no superar el saldo.','danger');const p=createPaymentRecord(o,amount,data.method,data.reference,data.notes);if(data.date)p.createdAt=`${data.date}T12:00:00.000Z`;updateOrderFinancials(o);recalcClientBalance(o.clientId);invalidateOrderPdf(o);if(safeSave('Pago registrado y cartera actualizada.')){closeModal();renderRoute();}});}
async function viewDeliveryEvidence(orderId) {
  const order = orderById(orderId);
  const fileId = order?.deliveryEvidence?.fileId;
  if (!fileId) return toast('Este pedido no tiene evidencia guardada.', 'warn');
  try {
    const result = await Cloud.readStoredFile(fileId);
    const url = URL.createObjectURL(result.blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error(error);
    toast(firebaseErrorMessage(error), 'danger');
  }
}

function openOrderStatusModal(orderId){const o=orderById(orderId);if(!o)return;openModal(`<div class="modal-head"><div><h2>Actualizar despacho</h2><p class="muted">${esc(o.number)} · ${esc(o.clientName)}</p></div><button class="modal-close" data-close-modal>×</button></div><form id="statusForm"><div class="form-grid"><div class="field"><label>Estado</label><select class="select" name="status">${['Pendiente de aprobación','Confirmado','En preparación','Listo para despacho','En ruta','Entrega parcial','Entregado'].map(x=>`<option ${o.status===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Responsable de ruta</label><select class="select" name="assignedTo"><option value="">Sin asignar</option>${DB.users.filter(u=>u.status==='Activo'&&['Ruta','Bodega','Administrador'].includes(u.role)).map(u=>`<option value="${u.id}" ${o.assignedTo===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div><div class="field"><label>Fecha de despacho</label><input class="input" type="date" name="dispatchDate" value="${esc(o.dispatchDate||todayKey())}"></div><div class="field full"><label>Nota logística</label><textarea class="textarea" name="dispatchNotes">${esc(o.dispatchNotes||'')}</textarea></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Actualizar</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();document.getElementById('statusForm').addEventListener('submit',e=>{e.preventDefault();Object.assign(o,Object.fromEntries(new FormData(e.currentTarget)),{updatedAt:nowIso()});audit('ACTUALIZAR','Pedido',o.id,`Estado ${o.status}`);if(safeSave('Estado de despacho actualizado.')){closeModal();renderRoute();}});}
function cancelOrder(orderId){const o=orderById(orderId);if(!o||o.status==='Cancelado')return;if(!confirm(`¿Cancelar ${o.number}? El inventario vendido regresará a existencias.`))return;(o.items||[]).forEach(item=>{const p=productById(item.productId);if(!p)return;const before=num(p.stock);p.stock=before+num(item.quantity);DB.inventoryMovements.unshift({id:id('mov'),type:'Reversión por cancelación',productId:p.id,productCode:p.code,productName:p.name,quantity:num(item.quantity),stockBefore:before,stockAfter:p.stock,reference:o.number,createdAt:nowIso(),createdBy:currentUserEmail()});});o.status='Cancelado';o.updatedAt=nowIso();recalcClientBalance(o.clientId);invalidateOrderPdf(o);audit('CANCELAR','Pedido',o.id,o.number);if(safeSave('Pedido cancelado e inventario restaurado.')){closeModal();renderOrders();}}

function renderClients(){const filter=ui.clientFilter.toLowerCase();const all=DB.clients.filter(c=>!filter||[c.businessName,c.contactName,c.document,c.phone,c.city,c.type].some(x=>String(x).toLowerCase().includes(filter))).sort((a,b)=>a.businessName.localeCompare(b.businessName));const page=paginate(all,ui.clientPage);ui.clientPage=page.page;document.getElementById('view').innerHTML=`<div class="card"><div class="section-title"><div><h2>Clientes comerciales</h2><p>Negocios o personas con historial, cupo, cartera y pedidos frecuentes.</p></div><button class="btn btn-primary" id="newClient">＋ Registrar cliente</button></div><div class="toolbar"><input class="input search" id="clientSearch" placeholder="Buscar negocio, contacto, NIT, teléfono o ciudad" value="${esc(ui.clientFilter)}"><span class="pill">${all.length} clientes</span></div>${page.items.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Condiciones</th><th class="money">Cartera</th><th>Historial</th><th>Acciones</th></tr></thead><tbody>${page.items.map(c=>{const orders=DB.orders.filter(o=>o.clientId===c.id&&o.status!=='Cancelado'),total=orders.reduce((s,o)=>s+orderEffectiveTotal(o),0);return `<tr><td><div class="row-main"><div class="avatar">${esc(initials(c.businessName))}</div><div><b>${esc(c.businessName)}</b><div class="tiny muted">${esc(c.type)} · ${esc(c.city||'Sin ciudad')}</div></div></div></td><td>${esc(c.contactName||'—')}<div class="tiny muted">${esc(c.phone||c.whatsapp||'Sin teléfono')}</div></td><td>${esc(priceListLabel(c.priceList))}<div class="tiny muted">${esc(c.paymentTerms||'Contado')}</div></td><td class="money"><b>${money(c.currentBalance)}</b><div class="tiny muted">Cupo ${money(c.creditLimit)}</div></td><td><b>${orders.length} pedidos</b><div class="tiny muted">Compras ${money(total)}</div></td><td><div class="actions"><button class="btn btn-info btn-sm" data-client-view="${c.id}">Ver</button><button class="btn btn-secondary btn-sm" data-client-edit="${c.id}">Editar</button><button class="btn btn-primary btn-sm" data-client-order="${c.id}">Pedido</button></div></td></tr>`;}).join('')}</tbody></table></div>${paginationHtml(page,'clients')}`:emptyState('No se encontraron clientes.')}</div>`;document.getElementById('newClient').addEventListener('click',()=>openClientForm());document.getElementById('clientSearch').addEventListener('input',e=>{ui.clientFilter=e.target.value;ui.clientPage=1;renderClients();});bindPagination('clients',page);document.querySelectorAll('[data-client-view]').forEach(b=>b.addEventListener('click',()=>viewClient(b.dataset.clientView)));document.querySelectorAll('[data-client-edit]').forEach(b=>b.addEventListener('click',()=>openClientForm(false,b.dataset.clientEdit)));document.querySelectorAll('[data-client-order]').forEach(b=>b.addEventListener('click',()=>{ui.selectedClientId=b.dataset.clientOrder;ui.orderCart=[];navigate('orderNew');}));}
function openClientForm(returnToOrder=false,clientId=''){const c=clientById(clientId)||{type:'Almacén de repuestos',businessName:'',contactName:'',document:'',phone:'',whatsapp:'',city:'',zone:'',address:'',priceList:'mayorista',paymentTerms:'Contado',creditDays:0,creditLimit:0,currentBalance:0,status:'Activo',sellerId:currentUser()?.id||'',notes:''};openModal(`<div class="modal-head"><div><h2>${clientId?'Editar cliente':'Registrar cliente'}</h2><p class="muted">Datos comerciales necesarios para vender, cobrar y entregar.</p></div><button class="modal-close" data-close-modal>×</button></div><form id="clientForm"><div class="form-grid"><div class="field"><label>Negocio o persona *</label><input class="input" name="businessName" value="${esc(c.businessName)}" required></div><div class="field"><label>Tipo</label><select class="select" name="type">${['Almacén de repuestos','Taller','Lubricentro','Negocio de motos','Empresa','Revendedor','Persona natural','Venta de contado'].map(x=>`<option ${c.type===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Contacto</label><input class="input" name="contactName" value="${esc(c.contactName)}"></div><div class="field"><label>NIT o documento</label><input class="input" name="document" value="${esc(c.document)}"></div><div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(c.phone)}"></div><div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" value="${esc(c.whatsapp)}"></div><div class="field"><label>Ciudad</label><input class="input" name="city" value="${esc(c.city)}"></div><div class="field"><label>Zona o ruta</label><input class="input" name="zone" value="${esc(c.zone)}"></div><div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(c.address)}"></div><div class="field"><label>Lista de precios</label><select class="select" name="priceList">${['general','mayorista','distribuidor','especial'].map(x=>`<option value="${x}" ${c.priceList===x?'selected':''}>${priceListLabel(x)}</option>`).join('')}</select></div><div class="field"><label>Condición de pago</label><input class="input" name="paymentTerms" value="${esc(c.paymentTerms)}"></div><div class="field"><label>Días de crédito</label><input class="input" type="number" min="0" name="creditDays" value="${num(c.creditDays)}"></div><div class="field"><label>Cupo de crédito</label><input class="input" type="number" min="0" name="creditLimit" value="${num(c.creditLimit)}"></div><div class="field"><label>Vendedor asignado</label><select class="select" name="sellerId"><option value="">Sin asignar</option>${DB.users.filter(u=>u.status==='Activo'&&['Vendedor','Administrador'].includes(u.role)).map(u=>`<option value="${u.id}" ${c.sellerId===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div><div class="field"><label>Estado</label><select class="select" name="status"><option ${c.status==='Activo'?'selected':''}>Activo</option><option ${c.status==='Inactivo'?'selected':''}>Inactivo</option><option ${c.status==='Bloqueado'?'selected':''}>Bloqueado</option></select></div><div class="field full"><label>Notas comerciales</label><textarea class="textarea" name="notes">${esc(c.notes)}</textarea></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar cliente</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();document.getElementById('clientForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));data.creditDays=num(data.creditDays);data.creditLimit=num(data.creditLimit);data.updatedAt=nowIso();if(clientId)Object.assign(c,data);else{data.id=id('cli');data.code=nextNumber('clients','CLI');data.currentBalance=0;data.createdAt=nowIso();DB.clients.push(data);}audit(clientId?'ACTUALIZAR':'CREAR','Cliente',data.id||c.id,data.businessName);if(safeSave('Cliente guardado correctamente.')){closeModal();ui.selectedClientId=data.id||c.id;if(returnToOrder)renderOrderNew();else renderClients();}});}
function viewClient(clientId){const c=clientById(clientId);if(!c)return;const orders=DB.orders.filter(o=>o.clientId===c.id&&o.status!=='Cancelado').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const payments=DB.payments.filter(p=>p.clientId===c.id&&p.status!=='Anulado').sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const total=orders.reduce((s,o)=>s+orderEffectiveTotal(o),0),available=Math.max(0,num(c.creditLimit)-num(c.currentBalance));openModal(`<div class="modal-head"><div><h2>${esc(c.businessName)}</h2><p class="muted">${esc(c.type)} · ${esc(c.city||'Sin ciudad')}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="grid grid-4"><div class="mini-stat"><span>Pedidos</span><b>${orders.length}</b></div><div class="mini-stat"><span>Compras</span><b>${money(total)}</b></div><div class="mini-stat"><span>Saldo</span><b>${money(c.currentBalance)}</b></div><div class="mini-stat"><span>Cupo disponible</span><b>${money(available)}</b></div></div>${c.notes?`<div class="notice" style="margin-top:14px"><b>Nota:</b> ${esc(c.notes)}</div>`:''}<h3 style="margin-top:18px">Pedidos recientes</h3>${orders.length?`<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Pago</th><th class="money">Total</th><th class="money">Saldo</th><th></th></tr></thead><tbody>${orders.slice(0,10).map(o=>`<tr><td><b>${esc(o.number)}</b></td><td>${dateOnly(o.createdAt)}</td><td>${paymentBadge(paymentStatusFor(o))}</td><td class="money">${money(orderEffectiveTotal(o))}</td><td class="money"><b>${money(o.balance)}</b></td><td><button class="btn btn-secondary btn-sm" data-repeat-client="${o.id}">Repetir</button></td></tr>`).join('')}</tbody></table></div>`:emptyState('Este cliente todavía no tiene pedidos.')}<h3 style="margin-top:18px">Últimos pagos</h3>${payments.length?payments.slice(0,6).map(p=>`<div class="summary-row"><span>${dateOnly(p.createdAt)} · ${esc(p.orderNumber)} · ${esc(p.method)}</span><b>${money(p.amount)}</b></div>`).join(''):emptyState('No hay pagos registrados.')}<div class="actions" style="margin-top:16px"><button class="btn btn-primary" data-order-client="${c.id}">Nuevo pedido</button>${c.currentBalance>0?`<button class="btn btn-warning" data-pay-client="${c.id}">Abonar a deuda</button>`:''}</div>`);bindCloseModal();document.querySelectorAll('[data-repeat-client]').forEach(b=>b.addEventListener('click',()=>{closeModal();repeatOrder(b.dataset.repeatClient);}));document.querySelector('[data-order-client]')?.addEventListener('click',()=>{ui.selectedClientId=c.id;ui.orderCart=[];closeModal();navigate('orderNew');});document.querySelector('[data-pay-client]')?.addEventListener('click',()=>openClientDebtPayment(c.id));}
function openClientDebtPayment(clientId){const c=clientById(clientId),orders=DB.orders.filter(o=>o.clientId===clientId&&o.balance>0&&o.status!=='Cancelado').sort((a,b)=>String(a.dueDate||a.createdAt).localeCompare(String(b.dueDate||b.createdAt)));if(!orders.length)return toast('El cliente no tiene pedidos pendientes.','warn');openModal(`<div class="modal-head"><div><h2>Abonar a deuda</h2><p class="muted">${esc(c.businessName)} · Saldo ${money(c.currentBalance)}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="field"><label>Pedido a abonar</label><select class="select" id="debtOrder">${orders.map(o=>`<option value="${o.id}">${o.number} · Saldo ${money(o.balance)} · ${paymentStatusFor(o)}</option>`).join('')}</select></div><button class="btn btn-primary" id="continueDebt" style="margin-top:14px">Continuar</button>`);bindCloseModal();document.getElementById('continueDebt').addEventListener('click',()=>openPaymentModal(document.getElementById('debtOrder').value));}

function renderPortfolio(){const filter=ui.portfolioFilter.toLowerCase();const clients=DB.clients.filter(c=>num(c.currentBalance)>0&&(!filter||[c.businessName,c.document,c.city].some(x=>String(x).toLowerCase().includes(filter)))).sort((a,b)=>num(b.currentBalance)-num(a.currentBalance));const page=paginate(clients,ui.portfolioPage);ui.portfolioPage=page.page;const total=clients.reduce((s,c)=>s+num(c.currentBalance),0),overdue=DB.orders.filter(o=>!['Cancelado','Borrador','Convertido'].includes(o.status)&&paymentStatusFor(o)==='Vencido').reduce((s,o)=>s+num(o.balance),0);document.getElementById('view').innerHTML=`<div class="grid grid-3">${statCard('Cartera total',money(total),'💳')}${statCard('Cartera vencida',money(overdue),'⏰')}${statCard('Clientes con saldo',clients.length,'👥')}</div><div class="card" style="margin-top:16px"><div class="section-title"><div><h2>Seguimiento de cartera</h2><p>Identifica quién debe, cuánto debe y qué pedidos están vencidos.</p></div></div><div class="toolbar"><input class="input search" id="portfolioSearch" placeholder="Buscar cliente, NIT o ciudad" value="${esc(ui.portfolioFilter)}"><span class="pill">10 por página</span></div>${page.items.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Pedidos pendientes</th><th>Más antiguo</th><th>Estado crítico</th><th class="money">Saldo</th><th>Acciones</th></tr></thead><tbody>${page.items.map(c=>{const os=DB.orders.filter(o=>o.clientId===c.id&&o.balance>0&&o.status!=='Cancelado').sort((a,b)=>String(a.dueDate||a.createdAt).localeCompare(String(b.dueDate||b.createdAt))),old=os[0],expired=os.some(o=>paymentStatusFor(o)==='Vencido');return `<tr><td><b>${esc(c.businessName)}</b><div class="tiny muted">${esc(c.phone||c.whatsapp||'Sin teléfono')}</div></td><td>${os.length}</td><td>${old?`${esc(old.number)}<div class="tiny muted">Vence ${old.dueDate?dateOnly(old.dueDate):'—'}</div>`:'—'}</td><td>${expired?'<span class="badge danger">Vencida</span>':'<span class="badge warn">Pendiente</span>'}</td><td class="money"><b>${money(c.currentBalance)}</b></td><td><div class="actions"><button class="btn btn-warning btn-sm" data-portfolio-pay="${c.id}">Abonar</button><button class="btn btn-success btn-sm" data-portfolio-wa="${c.id}">WhatsApp</button><button class="btn btn-info btn-sm" data-portfolio-view="${c.id}">Ver</button></div></td></tr>`;}).join('')}</tbody></table></div>${paginationHtml(page,'portfolio')}`:emptyState('No hay saldos pendientes.')}</div>`;document.getElementById('portfolioSearch').addEventListener('input',e=>{ui.portfolioFilter=e.target.value;ui.portfolioPage=1;renderPortfolio();});bindPagination('portfolio',page);document.querySelectorAll('[data-portfolio-pay]').forEach(b=>b.addEventListener('click',()=>openClientDebtPayment(b.dataset.portfolioPay)));document.querySelectorAll('[data-portfolio-view]').forEach(b=>b.addEventListener('click',()=>viewClient(b.dataset.portfolioView)));document.querySelectorAll('[data-portfolio-wa]').forEach(b=>b.addEventListener('click',()=>sendPortfolioWhatsApp(b.dataset.portfolioWa)));}
function sendPortfolioWhatsApp(clientId){const c=clientById(clientId);if(!c)return;let phone=normalizePhone(c.whatsapp||c.phone);if(phone.length===10)phone=`${DB.settings.whatsappCountryCode||'57'}${phone}`;const pending=DB.orders.filter(o=>o.clientId===c.id&&o.balance>0&&o.status!=='Cancelado');const text=`Hola, ${c.businessName}. Actualmente registra un saldo pendiente de ${money(c.currentBalance)} correspondiente a ${pending.length} pedido(s). Por favor contáctanos para confirmar el pago o abono. Gracias.`;window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank','noopener');}

function renderQuotes(){const filter=ui.quoteFilter.toLowerCase();const all=DB.quotes.filter(q=>!filter||[q.number,q.clientName,q.status].some(x=>String(x).toLowerCase().includes(filter))).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const page=paginate(all,ui.quotePage);ui.quotePage=page.page;document.getElementById('view').innerHTML=`<div class="card"><div class="section-title"><div><h2>Cotizaciones</h2><p>Comparte la cotización y conviértela en pedido sin repetir información.</p></div><button class="btn btn-primary" data-go="orderNew">＋ Nueva cotización</button></div><div class="toolbar"><input class="input search" id="quoteSearch" placeholder="Buscar cotización, cliente o estado" value="${esc(ui.quoteFilter)}"><span class="pill">${all.length} cotizaciones</span></div>${page.items.length?`<div class="table-wrap"><table><thead><tr><th>Cotización</th><th>Cliente</th><th>Vigencia</th><th>Estado</th><th class="money">Total</th><th>Acciones</th></tr></thead><tbody>${page.items.map(q=>`<tr><td><b>${esc(q.number)}</b><div class="tiny muted">${dateTime(q.createdAt)}</div></td><td>${esc(q.clientName)}</td><td>${dateOnly(q.validUntil)}</td><td>${statusBadge(q.status)}</td><td class="money"><b>${money(q.total)}</b></td><td><div class="actions"><button class="btn btn-success btn-sm" data-wa-quote="${q.id}">WhatsApp</button><button class="btn btn-info btn-sm" data-pdf-quote="${q.id}">Ver factura</button>${q.status==='Pendiente'?`<button class="btn btn-primary btn-sm" data-convert-quote="${q.id}">Convertir</button>`:''}<button class="btn btn-secondary btn-sm" data-status-quote="${q.id}">Estado</button></div></td></tr>`).join('')}</tbody></table></div>${paginationHtml(page,'quotes')}`:emptyState('Todavía no hay cotizaciones.')}</div>`;bindGoButtons();document.getElementById('quoteSearch').addEventListener('input',e=>{ui.quoteFilter=e.target.value;ui.quotePage=1;renderQuotes();});bindPagination('quotes',page);document.querySelectorAll('[data-wa-quote]').forEach(b=>b.addEventListener('click',()=>shareDocumentWhatsApp(DB.quotes.find(q=>q.id===b.dataset.waQuote),'quote')));document.querySelectorAll('[data-pdf-quote]').forEach(b=>b.addEventListener('click',()=>viewQuotePdf(b.dataset.pdfQuote)));document.querySelectorAll('[data-convert-quote]').forEach(b=>b.addEventListener('click',()=>convertQuote(b.dataset.convertQuote)));document.querySelectorAll('[data-status-quote]').forEach(b=>b.addEventListener('click',()=>openQuoteStatus(b.dataset.statusQuote)));}
function convertQuote(quoteId){const q=DB.quotes.find(x=>x.id===quoteId);if(!q)return;ui.selectedClientId=q.clientId;ui.orderCart=(q.items||[]).map(i=>{const p=productById(i.productId);return {...i,stock:num(p?.stock),quantity:Math.min(num(i.quantity),num(p?.stock))};}).filter(i=>i.quantity>0);q.status='Aceptada';q.updatedAt=nowIso();safeSave('Cotización cargada para convertir en pedido.');navigate('orderNew');}
function openQuoteStatus(quoteId){const q=DB.quotes.find(x=>x.id===quoteId);if(!q)return;openModal(`<div class="modal-head"><div><h2>Estado de cotización</h2><p class="muted">${esc(q.number)}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="field"><label>Estado</label><select class="select" id="quoteStatus">${['Pendiente','Aceptada','Rechazada','Vencida'].map(x=>`<option ${q.status===x?'selected':''}>${x}</option>`).join('')}</select></div><button class="btn btn-primary" id="saveQuoteStatus" style="margin-top:14px">Guardar</button>`);bindCloseModal();document.getElementById('saveQuoteStatus').addEventListener('click',()=>{q.status=document.getElementById('quoteStatus').value;q.updatedAt=nowIso();if(safeSave('Cotización actualizada.')){closeModal();renderQuotes();}});}

function renderReturns(){const all=DB.returns.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const page=paginate(all,ui.returnPage);ui.returnPage=page.page;document.getElementById('view').innerHTML=`<div class="card"><div class="section-title"><div><h2>Devoluciones</h2><p>Relacionadas con pedidos, inventario y nota a favor del cliente.</p></div><button class="btn btn-primary" id="newReturn">＋ Registrar devolución</button></div>${page.items.length?`<div class="table-wrap"><table><thead><tr><th>Devolución</th><th>Pedido</th><th>Cliente</th><th>Producto</th><th>Cantidad</th><th class="money">Crédito</th><th>Estado</th></tr></thead><tbody>${page.items.map(r=>`<tr><td><b>${esc(r.number)}</b><div class="tiny muted">${dateTime(r.createdAt)}</div></td><td>${esc(r.orderNumber)}</td><td>${esc(r.clientName)}</td><td>${esc(r.productName)}</td><td>${num(r.quantity)}</td><td class="money"><b>${money(r.creditAmount)}</b></td><td>${statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>${paginationHtml(page,'returns')}`:emptyState('No hay devoluciones registradas.')}</div>`;document.getElementById('newReturn').addEventListener('click',openReturnForm);bindPagination('returns',page);}
function openReturnForm(){const orders=DB.orders.filter(o=>!['Cancelado','Borrador','Convertido'].includes(o.status)&&(o.items||[]).length);if(!orders.length)return toast('No hay pedidos disponibles para devolución.','warn');openModal(`<div class="modal-head"><div><h2>Registrar devolución</h2><p class="muted">Selecciona pedido, producto y cantidad.</p></div><button class="modal-close" data-close-modal>×</button></div><form id="returnForm"><div class="form-grid"><div class="field full"><label>Pedido</label><select class="select" id="returnOrder" name="orderId">${orders.map(o=>`<option value="${o.id}">${o.number} · ${esc(o.clientName)}</option>`).join('')}</select></div><div class="field full"><label>Producto</label><select class="select" id="returnProduct" name="productId"></select></div><div class="field"><label>Cantidad</label><input class="input" type="number" min="1" name="quantity" value="1" required></div><div class="field"><label>Resolución</label><select class="select" name="resolution"><option>Nota a favor</option><option>Cambio de producto</option><option>Reembolso</option><option>Garantía en revisión</option></select></div><div class="field"><label>Reintegrar al inventario</label><select class="select" name="restock"><option value="si">Sí, producto en buen estado</option><option value="no">No, producto averiado</option></select></div><div class="field full"><label>Motivo *</label><textarea class="textarea" name="reason" required></textarea></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Registrar devolución</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();const fill=()=>{const o=orderById(document.getElementById('returnOrder').value);document.getElementById('returnProduct').innerHTML=(o.items||[]).map(i=>`<option value="${i.productId}">${esc(i.name)} · Comprado ${i.quantity}</option>`).join('');};fill();document.getElementById('returnOrder').addEventListener('change',fill);document.getElementById('returnForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),o=orderById(data.orderId),item=(o.items||[]).find(i=>i.productId===data.productId),previous=DB.returns.filter(r=>r.orderId===o.id&&r.productId===data.productId&&r.status!=='Anulada').reduce((s,r)=>s+num(r.quantity),0),quantity=Math.floor(num(data.quantity));if(!item||quantity<1||previous+quantity>num(item.quantity))return toast('La cantidad supera lo vendido o ya devuelto.','danger');const credit=quantity*num(item.price),r={id:id('ret'),number:nextNumber('returns','DEV'),orderId:o.id,orderNumber:o.number,clientId:o.clientId,clientName:o.clientName,productId:item.productId,productName:item.name,quantity,unitPrice:item.price,creditAmount:credit,resolution:data.resolution,restock:data.restock==='si',reason:data.reason,status:'Registrada',createdAt:nowIso(),createdBy:currentUserEmail()};DB.returns.unshift(r);if(r.restock){const p=productById(item.productId),before=num(p.stock);p.stock=before+quantity;DB.inventoryMovements.unshift({id:id('mov'),type:'Entrada por devolución',productId:p.id,productCode:p.code,productName:p.name,quantity,stockBefore:before,stockAfter:p.stock,reference:r.number,createdAt:nowIso(),createdBy:currentUserEmail()});}updateOrderFinancials(o);recalcClientBalance(o.clientId);invalidateOrderPdf(o);audit('CREAR','Devolución',r.id,r.number);if(safeSave('Devolución registrada y cartera recalculada.')){closeModal();renderReturns();}});}

function renderProducts(){const filter=ui.productFilter.toLowerCase();const all=DB.products.filter(p=>!filter||[p.code,p.barcode,p.name,p.brand,p.category,p.viscosity].some(x=>String(x).toLowerCase().includes(filter))).sort((a,b)=>a.name.localeCompare(b.name));const page=paginate(all,ui.productPage);ui.productPage=page.page;const value=DB.products.reduce((s,p)=>s+num(p.stock)*num(p.cost),0);document.getElementById('view').innerHTML=`<div class="grid grid-3">${statCard('Productos',DB.products.length,'🛢️')}${statCard('Valor inventario',money(value),'💰')}${statCard('Stock crítico',DB.products.filter(p=>num(p.stock)<=num(p.minStock)).length,'⚠️')}</div><div class="card" style="margin-top:16px"><div class="section-title"><div><h2>Catálogo e inventario</h2><p>Precios por cliente, ubicación, proveedor y existencia disponible.</p></div><button class="btn btn-primary" id="newProduct">＋ Registrar producto</button></div><div class="toolbar"><input class="input search" id="productSearch" placeholder="Buscar código, barras, producto, marca o viscosidad" value="${esc(ui.productFilter)}"><span class="pill">${all.length} productos</span></div>${page.items.length?`<div class="table-wrap"><table><thead><tr><th>Producto</th><th>Clasificación</th><th>Existencias</th><th>Proveedor</th><th class="money">Costo</th><th class="money">Precios</th><th>Acciones</th></tr></thead><tbody>${page.items.map(p=>`<tr><td><div class="row-main"><div class="product-thumb">🛢️</div><div><b>${esc(p.name)}</b><div class="tiny muted">${esc(p.code)} · ${esc(p.brand||'Sin marca')} · ${esc(p.presentation||'')}</div><div class="tiny muted">Barras: ${esc(p.barcode||'—')} · Ubicación ${esc(p.location||'—')}</div></div></div></td><td>${esc(p.category)}<div class="tiny muted">${esc(p.segment||'')} ${p.viscosity?`· ${esc(p.viscosity)}`:''}</div></td><td><b>${num(p.stock)} ${esc(p.unit||'und.')}</b><div class="tiny muted">Mínimo ${num(p.minStock)} ${num(p.stock)<=num(p.minStock)?'· Reponer':''}</div></td><td>${esc(supplierById(p.supplierId)?.businessName||'—')}</td><td class="money">${money(p.cost)}</td><td class="money"><b>${money(p.prices?.distribuidor)}</b><div class="tiny muted">May. ${money(p.prices?.mayorista)} · Gen. ${money(p.prices?.general)}</div></td><td><div class="actions"><button class="btn btn-secondary btn-sm" data-product-edit="${p.id}">Editar</button><button class="btn btn-warning btn-sm" data-product-stock="${p.id}">Ajustar</button></div></td></tr>`).join('')}</tbody></table></div>${paginationHtml(page,'products')}`:emptyState('No se encontraron productos.')}</div>`;document.getElementById('newProduct').addEventListener('click',()=>openProductForm());document.getElementById('productSearch').addEventListener('input',e=>{ui.productFilter=e.target.value;ui.productPage=1;renderProducts();});bindPagination('products',page);document.querySelectorAll('[data-product-edit]').forEach(b=>b.addEventListener('click',()=>openProductForm(b.dataset.productEdit)));document.querySelectorAll('[data-product-stock]').forEach(b=>b.addEventListener('click',()=>openStockAdjust(b.dataset.productStock)));}
function openProductForm(productId=''){const p=productById(productId)||{code:'',barcode:'',name:'',brand:'',category:'Aceites para carro',segment:'Carros',viscosity:'',presentation:'1 litro',unit:'Unidad',unitsPerCase:1,location:'',supplierId:'',stock:0,minStock:0,cost:0,prices:{general:0,mayorista:0,distribuidor:0},status:'Activo'};openModal(`<div class="modal-head"><div><h2>${productId?'Editar producto':'Registrar producto'}</h2><p class="muted">Información comercial y de inventario para carros y motos.</p></div><button class="modal-close" data-close-modal>×</button></div><form id="productForm"><div class="form-grid-3"><div class="field"><label>Código *</label><input class="input" name="code" value="${esc(p.code)}" required></div><div class="field"><label>Código de barras</label><input class="input" name="barcode" value="${esc(p.barcode)}"></div><div class="field"><label>Producto *</label><input class="input" name="name" value="${esc(p.name)}" required></div><div class="field"><label>Marca</label><input class="input" name="brand" value="${esc(p.brand)}"></div><div class="field"><label>Categoría</label><select class="select" name="category">${['Aceites para carro','Aceites para moto','Refrigerantes','Aditivos','Filtros','Baterías','Bujías','Repuestos','Otros'].map(x=>`<option ${p.category===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Segmento</label><select class="select" name="segment">${['Carros','Motos','Carros y motos','Pesados','Universal'].map(x=>`<option ${p.segment===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Viscosidad/referencia</label><input class="input" name="viscosity" value="${esc(p.viscosity)}"></div><div class="field"><label>Presentación</label><input class="input" name="presentation" value="${esc(p.presentation)}"></div><div class="field"><label>Unidad</label><select class="select" name="unit">${['Unidad','Caja','Galón','Litro','Juego','Par'].map(x=>`<option ${p.unit===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Unidades por caja</label><input class="input" type="number" min="1" name="unitsPerCase" value="${num(p.unitsPerCase)||1}"></div><div class="field"><label>Ubicación</label><input class="input" name="location" value="${esc(p.location)}"></div><div class="field"><label>Proveedor principal</label><select class="select" name="supplierId"><option value="">Sin asignar</option>${DB.suppliers.map(s=>`<option value="${s.id}" ${p.supplierId===s.id?'selected':''}>${esc(s.businessName)}</option>`).join('')}</select></div><div class="field"><label>Stock actual</label><input class="input" type="number" min="0" name="stock" value="${num(p.stock)}" ${productId?'readonly':''}><span class="help">${productId?'Usa el botón Ajustar para conservar trazabilidad.':'Existencia inicial del producto.'}</span></div><div class="field"><label>Stock mínimo</label><input class="input" type="number" min="0" name="minStock" value="${num(p.minStock)}"></div><div class="field"><label>Costo</label><input class="input" type="number" min="0" name="cost" value="${num(p.cost)}"></div><div class="field"><label>Precio general</label><input class="input" type="number" min="0" name="general" value="${num(p.prices?.general)}"></div><div class="field"><label>Precio mayorista</label><input class="input" type="number" min="0" name="mayorista" value="${num(p.prices?.mayorista)}"></div><div class="field"><label>Precio distribuidor</label><input class="input" type="number" min="0" name="distribuidor" value="${num(p.prices?.distribuidor)}"></div><div class="field"><label>Estado</label><select class="select" name="status"><option ${p.status==='Activo'?'selected':''}>Activo</option><option ${p.status==='Inactivo'?'selected':''}>Inactivo</option></select></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar producto</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();document.getElementById('productForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),stock=num(data.stock),next={...data,unitsPerCase:num(data.unitsPerCase),stock,minStock:num(data.minStock),cost:num(data.cost),prices:{general:num(data.general),mayorista:num(data.mayorista),distribuidor:num(data.distribuidor)},updatedAt:nowIso()};delete next.general;delete next.mayorista;delete next.distribuidor;if(productId){next.stock=num(p.stock);Object.assign(p,next);audit('ACTUALIZAR','Producto',p.id,p.code);}else{next.id=id('pro');next.createdAt=nowIso();DB.products.push(next);DB.counters.products=num(DB.counters.products)+1;audit('CREAR','Producto',next.id,next.code);}if(safeSave('Producto guardado.')){closeModal();renderProducts();}});}
function openStockAdjust(productId){const p=productById(productId);if(!p)return;openModal(`<div class="modal-head"><div><h2>Ajustar inventario</h2><p class="muted">${esc(p.code)} · ${esc(p.name)}</p></div><button class="modal-close" data-close-modal>×</button></div><form id="stockForm"><div class="notice">Existencia actual: <b>${num(p.stock)} unidades</b></div><div class="form-grid" style="margin-top:14px"><div class="field"><label>Tipo</label><select class="select" name="type"><option>Entrada de mercancía</option><option>Salida manual</option><option>Ajuste de conteo</option><option>Producto averiado</option><option>Uso interno</option></select></div><div class="field"><label>Nueva existencia</label><input class="input" type="number" min="0" name="newStock" value="${num(p.stock)}" required></div><div class="field full"><label>Motivo *</label><textarea class="textarea" name="reason" required></textarea></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar ajuste</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();document.getElementById('stockForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),before=num(p.stock),after=num(data.newStock);p.stock=after;p.updatedAt=nowIso();DB.inventoryMovements.unshift({id:id('mov'),type:data.type,productId:p.id,productCode:p.code,productName:p.name,quantity:after-before,stockBefore:before,stockAfter:after,reference:data.reason,createdAt:nowIso(),createdBy:currentUserEmail()});audit('AJUSTAR','Inventario',p.id,data.reason);if(safeSave('Inventario actualizado.')){closeModal();renderProducts();}});}
function renderMovements(){const all=DB.inventoryMovements.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const page=paginate(all,ui.movementPage);ui.movementPage=page.page;document.getElementById('view').innerHTML=`<div class="card"><div class="section-title"><div><h2>Trazabilidad de inventario</h2><p>Cada venta, compra, devolución o ajuste conserva existencias anteriores y posteriores.</p></div></div>${page.items.length?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Producto</th><th>Movimiento</th><th>Cantidad</th><th>Existencias</th><th>Referencia</th><th>Usuario</th></tr></thead><tbody>${page.items.map(m=>`<tr><td>${dateTime(m.createdAt)}</td><td><b>${esc(m.productName)}</b><div class="tiny muted">${esc(m.productCode)}</div></td><td>${esc(m.type)}</td><td>${m.quantity>=0?`<span class="badge ok">＋${num(m.quantity)}</span>`:`<span class="badge danger">${num(m.quantity)}</span>`}</td><td>${num(m.stockBefore)} → <b>${num(m.stockAfter)}</b></td><td>${esc(m.reference||'—')}</td><td>${esc(m.createdBy||'—')}</td></tr>`).join('')}</tbody></table></div>${paginationHtml(page,'movements')}`:emptyState('Todavía no hay movimientos.')}</div>`;bindPagination('movements',page);}

function renderSuppliers(){const filter=ui.supplierFilter.toLowerCase();const all=DB.suppliers.filter(s=>!filter||[s.businessName,s.contactName,s.document,s.phone,s.city].some(x=>String(x).toLowerCase().includes(filter))).sort((a,b)=>a.businessName.localeCompare(b.businessName));const page=paginate(all,ui.supplierPage);ui.supplierPage=page.page;document.getElementById('view').innerHTML=`<div class="card"><div class="section-title"><div><h2>Proveedores</h2><p>Contactos, condiciones de compra e historial de abastecimiento.</p></div><button class="btn btn-primary" id="newSupplier">＋ Registrar proveedor</button></div><div class="toolbar"><input class="input search" id="supplierSearch" placeholder="Buscar proveedor, NIT, teléfono o ciudad" value="${esc(ui.supplierFilter)}"><span class="pill">${all.length} proveedores</span></div>${page.items.length?`<div class="table-wrap"><table><thead><tr><th>Proveedor</th><th>Contacto</th><th>Condiciones</th><th>Compras</th><th>Acciones</th></tr></thead><tbody>${page.items.map(s=>{const ps=DB.purchases.filter(p=>p.supplierId===s.id),total=ps.reduce((a,p)=>a+num(p.total),0);return `<tr><td><b>${esc(s.businessName)}</b><div class="tiny muted">${esc(s.document||'Sin NIT')} · ${esc(s.city||'')}</div></td><td>${esc(s.contactName||'—')}<div class="tiny muted">${esc(s.phone||'')}</div></td><td>${esc(s.paymentTerms||'Contado')}</td><td><b>${ps.length}</b><div class="tiny muted">${money(total)}</div></td><td><button class="btn btn-secondary btn-sm" data-edit-supplier="${s.id}">Editar</button></td></tr>`;}).join('')}</tbody></table></div>${paginationHtml(page,'suppliers')}`:emptyState('No hay proveedores.')}</div>`;document.getElementById('newSupplier').addEventListener('click',()=>openSupplierForm());document.getElementById('supplierSearch').addEventListener('input',e=>{ui.supplierFilter=e.target.value;ui.supplierPage=1;renderSuppliers();});bindPagination('suppliers',page);document.querySelectorAll('[data-edit-supplier]').forEach(b=>b.addEventListener('click',()=>openSupplierForm(b.dataset.editSupplier)));}
function openSupplierForm(supplierId=''){const s=supplierById(supplierId)||{businessName:'',contactName:'',document:'',phone:'',city:'',address:'',paymentTerms:'Contado',status:'Activo',notes:''};openModal(`<div class="modal-head"><div><h2>${supplierId?'Editar proveedor':'Registrar proveedor'}</h2></div><button class="modal-close" data-close-modal>×</button></div><form id="supplierForm"><div class="form-grid"><div class="field"><label>Razón social *</label><input class="input" name="businessName" value="${esc(s.businessName)}" required></div><div class="field"><label>NIT</label><input class="input" name="document" value="${esc(s.document)}"></div><div class="field"><label>Contacto</label><input class="input" name="contactName" value="${esc(s.contactName)}"></div><div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(s.phone)}"></div><div class="field"><label>Ciudad</label><input class="input" name="city" value="${esc(s.city)}"></div><div class="field"><label>Condiciones</label><input class="input" name="paymentTerms" value="${esc(s.paymentTerms)}"></div><div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(s.address)}"></div><div class="field"><label>Estado</label><select class="select" name="status"><option ${s.status==='Activo'?'selected':''}>Activo</option><option ${s.status==='Inactivo'?'selected':''}>Inactivo</option></select></div><div class="field full"><label>Notas</label><textarea class="textarea" name="notes">${esc(s.notes)}</textarea></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();document.getElementById('supplierForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));data.updatedAt=nowIso();if(supplierId)Object.assign(s,data);else{data.id=id('sup');data.code=nextNumber('suppliers','PROV');data.createdAt=nowIso();DB.suppliers.push(data);}audit(supplierId?'ACTUALIZAR':'CREAR','Proveedor',data.id||s.id,data.businessName);if(safeSave('Proveedor guardado.')){closeModal();renderSuppliers();}});}

function renderPurchases(){const all=DB.purchases.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));const page=paginate(all,ui.purchasePage);ui.purchasePage=page.page;const pending=all.filter(p=>p.status==='Pendiente').length;document.getElementById('view').innerHTML=`<div class="grid grid-3">${statCard('Compras registradas',all.length,'🛒')}${statCard('Pendientes por recibir',pending,'📦')}${statCard('Valor comprado',money(all.reduce((s,p)=>s+num(p.total),0)),'💰')}</div><div class="card" style="margin-top:16px"><div class="section-title"><div><h2>Compras y recepción</h2><p>Al recibir una compra se actualiza costo, existencias y movimientos.</p></div><button class="btn btn-primary" id="newPurchase">＋ Nueva compra</button></div>${page.items.length?`<div class="table-wrap"><table><thead><tr><th>Compra</th><th>Proveedor</th><th>Factura</th><th>Estado</th><th>Pago</th><th class="money">Total</th><th>Acciones</th></tr></thead><tbody>${page.items.map(p=>`<tr><td><b>${esc(p.number)}</b><div class="tiny muted">${dateTime(p.createdAt)}</div></td><td>${esc(p.supplierName)}</td><td>${esc(p.invoice||'—')}</td><td>${statusBadge(p.status)}</td><td>${paymentBadge(p.paymentStatus)}</td><td class="money"><b>${money(p.total)}</b></td><td>${p.status==='Pendiente'?`<button class="btn btn-success btn-sm" data-receive-purchase="${p.id}">Recibir</button>`:'<span class="tiny muted">Inventario actualizado</span>'}</td></tr>`).join('')}</tbody></table></div>${paginationHtml(page,'purchases')}`:emptyState('No hay compras registradas.')}</div>`;document.getElementById('newPurchase').addEventListener('click',openPurchaseForm);bindPagination('purchases',page);document.querySelectorAll('[data-receive-purchase]').forEach(b=>b.addEventListener('click',()=>receivePurchase(b.dataset.receivePurchase)));}
function openPurchaseForm(){if(!DB.suppliers.length||!DB.products.length)return toast('Primero registra proveedor y productos.','warn');openModal(`<div class="modal-head"><div><h2>Nueva compra</h2><p class="muted">Registra hasta cinco productos; la recepción puede hacerse después.</p></div><button class="modal-close" data-close-modal>×</button></div><form id="purchaseForm"><div class="form-grid"><div class="field"><label>Proveedor</label><select class="select" name="supplierId">${DB.suppliers.filter(s=>s.status==='Activo').map(s=>`<option value="${s.id}">${esc(s.businessName)}</option>`).join('')}</select></div><div class="field"><label>Factura del proveedor</label><input class="input" name="invoice"></div><div class="field"><label>Forma de pago</label><select class="select" name="paymentStatus"><option>Pagado</option><option>Crédito</option><option>Abonado</option><option>Pendiente</option></select></div><div class="field"><label>Recibir ahora</label><select class="select" name="receiveNow"><option value="si">Sí</option><option value="no">No, dejar pendiente</option></select></div></div><div class="purchase-lines" style="margin-top:14px">${[0,1,2,3,4].map((_,i)=>`<div class="purchase-line"><select class="select" name="product_${i}"><option value="">Producto ${i+1} (opcional)</option>${DB.products.map(p=>`<option value="${p.id}">${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select><input class="input" type="number" min="0" name="qty_${i}" placeholder="Cantidad"><input class="input" type="number" min="0" name="cost_${i}" placeholder="Costo unitario"></div>`).join('')}</div><div class="field" style="margin-top:14px"><label>Observaciones</label><textarea class="textarea" name="notes"></textarea></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar compra</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();document.getElementById('purchaseForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),items=[];for(let i=0;i<5;i++){const product=productById(data[`product_${i}`]),quantity=num(data[`qty_${i}`]),cost=num(data[`cost_${i}`]);if(product&&quantity>0&&cost>=0)items.push({productId:product.id,code:product.code,name:product.name,quantity,cost,lineTotal:quantity*cost});}if(!items.length)return toast('Agrega al menos un producto.','danger');const supplier=supplierById(data.supplierId),purchase={id:id('pur'),number:nextNumber('purchases','COM'),supplierId:supplier.id,supplierName:supplier.businessName,invoice:data.invoice,items,total:items.reduce((s,i)=>s+i.lineTotal,0),paymentStatus:data.paymentStatus,status:data.receiveNow==='si'?'Pendiente':'Pendiente',notes:data.notes,createdAt:nowIso(),createdBy:currentUserEmail()};DB.purchases.unshift(purchase);audit('CREAR','Compra',purchase.id,purchase.number);if(safeSave('Compra registrada.')){closeModal();if(data.receiveNow==='si')receivePurchase(purchase.id);else renderPurchases();}});}
function receivePurchaseInternal(purchase){if(purchase.status==='Recibida')return;(purchase.items||[]).forEach(item=>{const p=productById(item.productId);if(!p)return;const before=num(p.stock);p.stock=before+num(item.quantity);p.cost=num(item.cost);p.updatedAt=nowIso();DB.inventoryMovements.unshift({id:id('mov'),type:'Entrada por compra',productId:p.id,productCode:p.code,productName:p.name,quantity:num(item.quantity),stockBefore:before,stockAfter:p.stock,reference:purchase.number,createdAt:nowIso(),createdBy:currentUserEmail()});});purchase.status='Recibida';purchase.receivedAt=nowIso();purchase.receivedBy=currentUserEmail();audit('RECIBIR','Compra',purchase.id,purchase.number);}
function receivePurchase(purchaseId){const p=DB.purchases.find(x=>x.id===purchaseId);if(!p||p.status==='Recibida')return;if(!confirm(`¿Recibir ${p.number} y aumentar existencias?`))return;receivePurchaseInternal(p);if(safeSave('Compra recibida e inventario actualizado.'))renderPurchases();}

function renderDispatches(){const all=DB.orders.filter(o=>!['Cancelado','Borrador','Convertido'].includes(o.status)).sort((a,b)=>String(a.dispatchDate||a.createdAt).localeCompare(String(b.dispatchDate||b.createdAt)));const page=paginate(all,ui.dispatchPage);ui.dispatchPage=page.page;const pending=all.filter(o=>!['Entregado'].includes(o.status)).length;document.getElementById('view').innerHTML=`<div class="grid grid-3">${statCard('Pendientes',pending,'📦')}${statCard('En ruta',all.filter(o=>o.status==='En ruta').length,'🚚')}${statCard('Entregados',all.filter(o=>o.status==='Entregado').length,'✅')}</div><div class="card" style="margin-top:16px"><div class="section-title"><div><h2>Preparación y entregas</h2><p>Cambia el estado en pocos pasos y asigna responsable.</p></div></div>${page.items.length?`<div class="dispatch-board">${page.items.map(o=>{const user=DB.users.find(u=>u.id===o.assignedTo);return `<div class="dispatch-card"><div class="dispatch-card-top"><div><b>${esc(o.number)}</b><div class="tiny muted">${esc(o.clientName)}</div></div>${statusBadge(o.status)}</div><div class="dispatch-meta"><span>📍 ${esc(o.clientCity||'Sin ciudad')} · ${esc(o.deliveryType)}</span><span>📅 ${o.dispatchDate?dateOnly(o.dispatchDate):'Sin programar'}</span><span>👤 ${esc(user?.name||'Sin asignar')}</span><span>💳 ${paymentStatusFor(o)} · Saldo ${money(o.balance)}</span></div><div class="actions"><button class="btn btn-primary btn-sm" data-dispatch-status="${o.id}">Actualizar</button><button class="btn btn-success btn-sm" data-dispatch-wa="${o.id}">Avisar cliente</button></div></div>`;}).join('')}</div>${paginationHtml(page,'dispatches')}`:emptyState('No hay pedidos para despacho.')}</div>`;bindPagination('dispatches',page);document.querySelectorAll('[data-dispatch-status]').forEach(b=>b.addEventListener('click',()=>openOrderStatusModal(b.dataset.dispatchStatus)));document.querySelectorAll('[data-dispatch-wa]').forEach(b=>b.addEventListener('click',()=>sendDispatchWhatsApp(b.dataset.dispatchWa)));}
function sendDispatchWhatsApp(orderId){const o=orderById(orderId);if(!o)return;let phone=normalizePhone(o.clientWhatsapp);if(phone.length===10)phone=`${DB.settings.whatsappCountryCode||'57'}${phone}`;const text=`Hola, ${o.clientName}. Tu pedido ${o.number} se encuentra en estado: ${o.status}.${o.dispatchDate?` Fecha programada: ${dateOnly(o.dispatchDate)}.`:''} Gracias.`;window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`,'_blank','noopener');}

function cashTotals(session){if(!session)return{cash:0,transfer:0,card:0,other:0,expenses:0,expected:0};const end=session.closedAt||nowIso(),payments=DB.payments.filter(p=>p.status!=='Anulado'&&p.createdAt>=session.openedAt&&p.createdAt<=end),expenses=DB.expenses.filter(e=>e.status!=='Anulado'&&e.createdAt>=session.openedAt&&e.createdAt<=end);const result={cash:0,transfer:0,card:0,other:0,expenses:expenses.reduce((s,e)=>s+num(e.amount),0)};payments.forEach(p=>{if(p.method==='Efectivo')result.cash+=num(p.amount);else if(['Transferencia','Consignación'].includes(p.method))result.transfer+=num(p.amount);else if(p.method==='Tarjeta')result.card+=num(p.amount);else result.other+=num(p.amount);});result.expected=num(session.openingAmount)+result.cash-result.expenses;return result;}
function renderCash(){const session=activeCashSession(),history=DB.cashSessions.slice().sort((a,b)=>String(b.openedAt).localeCompare(String(a.openedAt))).slice(0,10);if(!session){document.getElementById('view').innerHTML=`<div class="grid grid-2"><div class="card"><div class="section-title"><div><h2>Abrir caja</h2><p>Inicia el control de efectivo para la jornada.</p></div></div><form id="openCashForm"><div class="field"><label>Base inicial</label><input class="input" type="number" min="0" step="1000" name="openingAmount" value="0" required></div><div class="field" style="margin-top:12px"><label>Observación</label><textarea class="textarea" name="notes"></textarea></div><button class="btn btn-primary" type="submit" style="margin-top:14px">Abrir caja</button></form></div><div class="card"><div class="section-title"><div><h2>Últimos cierres</h2></div></div>${cashHistoryHtml(history)}</div></div>`;document.getElementById('openCashForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),s={id:id('cash'),number:nextNumber('cashSessions','CAJ'),openingAmount:num(data.openingAmount),notes:data.notes,status:'Abierta',openedAt:nowIso(),openedBy:currentUserEmail()};DB.cashSessions.unshift(s);audit('ABRIR','Caja',s.id,s.number);if(safeSave('Caja abierta.'))renderCash();});return;}const totals=cashTotals(session);document.getElementById('view').innerHTML=`<div class="grid grid-4">${statCard('Base inicial',money(session.openingAmount),'🏁')}${statCard('Efectivo recibido',money(totals.cash),'💵')}${statCard('Gastos',money(totals.expenses),'🧾')}${statCard('Caja esperada',money(totals.expected),'🔐')}</div><div class="grid grid-2" style="margin-top:16px"><div class="card"><div class="section-title"><div><h2>Caja ${esc(session.number)}</h2><p>Abierta ${dateTime(session.openedAt)} por ${esc(session.openedBy)}</p></div></div><div class="summary-row"><span>Transferencias/consignaciones</span><b>${money(totals.transfer)}</b></div><div class="summary-row"><span>Tarjetas</span><b>${money(totals.card)}</b></div><div class="summary-row"><span>Otros métodos</span><b>${money(totals.other)}</b></div><div class="summary-row total"><span>Efectivo esperado</span><span>${money(totals.expected)}</span></div><div class="actions" style="margin-top:16px"><button class="btn btn-warning" id="newExpense">Registrar gasto</button><button class="btn btn-primary" id="closeCash">Cerrar caja</button></div></div><div class="card"><div class="section-title"><div><h2>Movimientos de la jornada</h2></div></div>${cashMovementsHtml(session)}</div></div><div class="card" style="margin-top:16px"><div class="section-title"><div><h2>Historial de cajas</h2></div></div>${cashHistoryHtml(history)}</div>`;document.getElementById('newExpense').addEventListener('click',()=>openExpenseModal(session.id));document.getElementById('closeCash').addEventListener('click',()=>openCloseCashModal(session.id));}
function cashMovementsHtml(session){const rows=[];DB.payments.filter(p=>p.status!=='Anulado'&&p.createdAt>=session.openedAt).forEach(p=>rows.push({date:p.createdAt,type:`Pago ${p.orderNumber}`,method:p.method,amount:p.amount}));DB.expenses.filter(e=>e.status!=='Anulado'&&e.createdAt>=session.openedAt).forEach(e=>rows.push({date:e.createdAt,type:`Gasto: ${e.concept}`,method:'Efectivo',amount:-num(e.amount)}));rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));return rows.length?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th class="money">Valor</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${dateTime(r.date)}</td><td>${esc(r.type)}</td><td>${esc(r.method)}</td><td class="money"><b>${money(r.amount)}</b></td></tr>`).join('')}</tbody></table></div>`:emptyState('Sin movimientos durante esta caja.');}
function cashHistoryHtml(history){return history.length?`<div class="table-wrap"><table><thead><tr><th>Caja</th><th>Apertura</th><th>Estado</th><th class="money">Esperado</th><th class="money">Diferencia</th></tr></thead><tbody>${history.map(s=>{const t=cashTotals(s);return `<tr><td><b>${esc(s.number)}</b></td><td>${dateTime(s.openedAt)}</td><td>${statusBadge(s.status)}</td><td class="money">${money(t.expected)}</td><td class="money">${s.status==='Cerrada'?money(num(s.difference)):'—'}</td></tr>`;}).join('')}</tbody></table></div>`:emptyState('No hay cierres anteriores.');}
function openExpenseModal(sessionId){openModal(`<div class="modal-head"><div><h2>Registrar gasto de caja</h2></div><button class="modal-close" data-close-modal>×</button></div><form id="expenseForm"><div class="form-grid"><div class="field"><label>Concepto *</label><input class="input" name="concept" required></div><div class="field"><label>Valor *</label><input class="input" type="number" min="1" name="amount" required></div><div class="field full"><label>Observación</label><textarea class="textarea" name="notes"></textarea></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar gasto</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();document.getElementById('expenseForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),expense={id:id('exp'),number:nextNumber('expenses','GAS'),cashSessionId:sessionId,concept:data.concept,amount:num(data.amount),notes:data.notes,status:'Aplicado',createdAt:nowIso(),createdBy:currentUserEmail()};DB.expenses.unshift(expense);audit('CREAR','Gasto',expense.id,expense.number);if(safeSave('Gasto registrado.')){closeModal();renderCash();}});}
function openCloseCashModal(sessionId){const s=DB.cashSessions.find(x=>x.id===sessionId),totals=cashTotals(s);openModal(`<div class="modal-head"><div><h2>Cerrar caja</h2><p class="muted">${esc(s.number)}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="summary-box"><div class="summary-row"><span>Base</span><b>${money(s.openingAmount)}</b></div><div class="summary-row"><span>Efectivo recibido</span><b>${money(totals.cash)}</b></div><div class="summary-row"><span>Gastos</span><b>-${money(totals.expenses)}</b></div><div class="summary-row total"><span>Efectivo esperado</span><span>${money(totals.expected)}</span></div></div><form id="closeCashForm" style="margin-top:14px"><div class="field"><label>Efectivo contado *</label><input class="input" type="number" min="0" name="countedAmount" value="${totals.expected}" required></div><div class="field" style="margin-top:12px"><label>Observación</label><textarea class="textarea" name="closingNotes"></textarea></div><button class="btn btn-primary" type="submit" style="margin-top:14px">Confirmar cierre</button></form>`);bindCloseModal();document.getElementById('closeCashForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));s.countedAmount=num(data.countedAmount);s.expectedAmount=totals.expected;s.difference=s.countedAmount-totals.expected;s.closingNotes=data.closingNotes;s.status='Cerrada';s.closedAt=nowIso();s.closedBy=currentUserEmail();audit('CERRAR','Caja',s.id,s.number);if(safeSave('Caja cerrada.')){closeModal();renderCash();}});}

function renderReports(){const from=`${ui.reportFrom}T00:00:00.000Z`,to=`${ui.reportTo}T23:59:59.999Z`,orders=DB.orders.filter(o=>!['Cancelado','Borrador','Convertido'].includes(o.status)&&o.createdAt>=from&&o.createdAt<=to),sales=orders.reduce((s,o)=>s+orderEffectiveTotal(o),0),cost=orders.reduce((s,o)=>s+(o.items||[]).reduce((a,i)=>a+num(i.costSnapshot)*num(i.quantity),0),0),profit=sales-cost,paid=DB.payments.filter(p=>p.status!=='Anulado'&&p.createdAt>=from&&p.createdAt<=to).reduce((s,p)=>s+num(p.amount),0),topProducts=aggregateTopProducts(orders).slice(0,10),clientMap=new Map();orders.forEach(o=>{const x=clientMap.get(o.clientId)||{name:o.clientName,value:0,orders:0};x.value+=orderEffectiveTotal(o);x.orders++;clientMap.set(o.clientId,x);});const topClients=[...clientMap.values()].sort((a,b)=>b.value-a.value).slice(0,10);document.getElementById('view').innerHTML=`<div class="card"><div class="toolbar"><div class="actions"><div class="field"><label>Desde</label><input class="input" id="reportFrom" type="date" value="${ui.reportFrom}"></div><div class="field"><label>Hasta</label><input class="input" id="reportTo" type="date" value="${ui.reportTo}"></div></div><div class="actions"><button class="btn btn-primary" id="applyReport">Aplicar</button><button class="btn btn-secondary" id="exportOrdersCsv">Exportar ventas CSV</button><button class="btn btn-secondary" id="exportPortfolioCsv">Exportar cartera CSV</button></div></div></div><div class="grid grid-4" style="margin-top:16px">${statCard('Ventas',money(sales),'💰',`${orders.length} pedidos`)}${statCard('Cobros recibidos',money(paid),'💳')}${statCard('Utilidad estimada',money(profit),'📈','Ventas menos costo registrado')}${statCard('Inventario valorizado',money(DB.products.reduce((s,p)=>s+num(p.stock)*num(p.cost),0)),'📦')}</div><div class="grid grid-2" style="margin-top:16px"><div class="card"><div class="section-title"><div><h2>Productos más vendidos</h2></div></div>${topProducts.length?topProducts.map((x,i)=>`<div class="summary-row"><span>${i+1}. ${esc(x.name)}</span><b>${x.quantity} · ${money(x.value)}</b></div>`).join(''):emptyState('Sin ventas en el periodo.')}</div><div class="card"><div class="section-title"><div><h2>Clientes principales</h2></div></div>${topClients.length?topClients.map((x,i)=>`<div class="summary-row"><span>${i+1}. ${esc(x.name)}<div class="tiny muted">${x.orders} pedidos</div></span><b>${money(x.value)}</b></div>`).join(''):emptyState('Sin ventas en el periodo.')}</div></div><div class="grid grid-2" style="margin-top:16px"><div class="card"><div class="section-title"><div><h2>Stock por reponer</h2></div></div>${DB.products.filter(p=>num(p.stock)<=num(p.minStock)).map(p=>`<div class="summary-row"><span>${esc(p.code)} · ${esc(p.name)}</span><b>${p.stock}/${p.minStock}</b></div>`).join('')||emptyState('No hay stock crítico.')}</div><div class="card"><div class="section-title"><div><h2>Cartera actual</h2></div></div><div class="summary-row"><span>Total pendiente</span><b>${money(DB.clients.reduce((s,c)=>s+num(c.currentBalance),0))}</b></div><div class="summary-row"><span>Vencida</span><b>${money(DB.orders.filter(o=>paymentStatusFor(o)==='Vencido'&&o.status!=='Cancelado').reduce((s,o)=>s+num(o.balance),0))}</b></div><div class="summary-row"><span>Clientes con saldo</span><b>${DB.clients.filter(c=>num(c.currentBalance)>0).length}</b></div></div></div>`;document.getElementById('applyReport').addEventListener('click',()=>{ui.reportFrom=document.getElementById('reportFrom').value;ui.reportTo=document.getElementById('reportTo').value;renderReports();});document.getElementById('exportOrdersCsv').addEventListener('click',exportOrdersCsv);document.getElementById('exportPortfolioCsv').addEventListener('click',exportPortfolioCsv);}
function exportOrdersCsv(){const rows=[['Pedido','Fecha','Cliente','Estado','Estado pago','Total','Pagado','Saldo','Vencimiento'],...DB.orders.map(o=>[o.number,o.createdAt,o.clientName,o.status,paymentStatusFor(o),orderEffectiveTotal(o),o.paid,o.balance,o.dueDate])];downloadText(rows.map(r=>r.map(csvEscape).join(',')).join('\n'),`ventas_${todayKey()}.csv`,'text/csv;charset=utf-8');}
function exportPortfolioCsv(){const rows=[['Cliente','NIT','Teléfono','Ciudad','Cupo','Saldo'],...DB.clients.filter(c=>num(c.currentBalance)>0).map(c=>[c.businessName,c.document,c.phone||c.whatsapp,c.city,c.creditLimit,c.currentBalance])];downloadText(rows.map(r=>r.map(csvEscape).join(',')).join('\n'),`cartera_${todayKey()}.csv`,'text/csv;charset=utf-8');}

function renderUsers(){document.getElementById('view').innerHTML=`<div class="card"><div class="section-title"><div><h2>Usuarios y roles</h2><p>Control visual local por perfil. Firebase Authentication queda preparado para la siguiente conexión.</p></div><button class="btn btn-primary" id="newUser">＋ Crear usuario</button></div><div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${DB.users.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${statusBadge(u.status)}</td><td><button class="btn btn-secondary btn-sm" data-edit-user="${u.id}">Editar</button></td></tr>`).join('')}</tbody></table></div><div class="notice warn" style="margin-top:14px">Las contraseñas de esta construcción son locales y solo sirven para probar roles. No deben usarse en producción.</div></div>`;document.getElementById('newUser').addEventListener('click',()=>openUserForm());document.querySelectorAll('[data-edit-user]').forEach(b=>b.addEventListener('click',()=>openUserForm(b.dataset.editUser)));}
function openUserForm(userId=''){const u=DB.users.find(x=>x.id===userId)||{name:'',email:'',password:'123456',role:'Vendedor',status:'Activo'};openModal(`<div class="modal-head"><div><h2>${userId?'Editar usuario':'Crear usuario'}</h2></div><button class="modal-close" data-close-modal>×</button></div><form id="userForm"><div class="form-grid"><div class="field"><label>Nombre *</label><input class="input" name="name" value="${esc(u.name)}" required></div><div class="field"><label>Correo *</label><input class="input" type="email" name="email" value="${esc(u.email)}" required></div><div class="field"><label>Contraseña local *</label><input class="input" name="password" value="${esc(u.password)}" required></div><div class="field"><label>Rol</label><select class="select" name="role">${Object.keys(ROLE_PERMISSIONS).map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></div><div class="field"><label>Estado</label><select class="select" name="status"><option ${u.status==='Activo'?'selected':''}>Activo</option><option ${u.status==='Inactivo'?'selected':''}>Inactivo</option></select></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar usuario</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);bindCloseModal();document.getElementById('userForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));const duplicate=DB.users.find(x=>x.email.toLowerCase()===data.email.toLowerCase()&&x.id!==userId);if(duplicate)return toast('Ya existe un usuario con ese correo.','danger');if(userId)Object.assign(u,data);else{data.id=id('usr');data.createdAt=nowIso();DB.users.push(data);}audit(userId?'ACTUALIZAR':'CREAR','Usuario',data.id||u.id,data.email);if(safeSave('Usuario guardado.')){closeModal();renderUsers();}});}

function renderSettings(){const s=DB.settings;document.getElementById('view').innerHTML=`<div class="grid grid-2"><div class="card"><div class="section-title"><div><h2>Datos del distribuidor</h2><p>Se muestran en facturas, cotizaciones y mensajes.</p></div></div><form id="settingsForm"><div class="form-grid"><div class="field full"><label>Nombre comercial</label><input class="input" name="businessName" value="${esc(s.businessName)}"></div><div class="field"><label>NIT</label><input class="input" name="nit" value="${esc(s.nit)}"></div><div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(s.phone)}"></div><div class="field"><label>Correo</label><input class="input" name="email" value="${esc(s.email)}"></div><div class="field"><label>Ciudad</label><input class="input" name="city" value="${esc(s.city)}"></div><div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(s.address)}"></div><div class="field"><label>Indicativo WhatsApp</label><input class="input" name="whatsappCountryCode" value="${esc(s.whatsappCountryCode)}"></div><div class="field"><label>Costo de entrega sugerido</label><input class="input" type="number" name="defaultDeliveryCost" value="${num(s.defaultDeliveryCost)}"></div><div class="field full"><label>Datos bancarios</label><textarea class="textarea" name="bankInfo">${esc(s.bankInfo)}</textarea></div><div class="field full"><label>Título de la factura</label><input class="input" name="documentLabel" value="${esc(s.documentLabel)}"></div><div class="field full"><label>Pie del documento</label><textarea class="textarea" name="footer">${esc(s.footer)}</textarea></div></div><button class="btn btn-primary" style="margin-top:16px" type="submit">Guardar configuración</button></form></div><div class="grid"><div class="card"><div class="section-title"><div><h2>Respaldo y mantenimiento</h2></div></div><div class="summary-row"><span>Versión</span><b>${APP_VERSION}</b></div><div class="summary-row"><span>Pedidos</span><b>${DB.orders.length}</b></div><div class="summary-row"><span>Clientes</span><b>${DB.clients.length}</b></div><div class="summary-row"><span>Productos</span><b>${DB.products.length}</b></div><div class="actions" style="margin-top:14px"><button class="btn btn-secondary" id="exportBackup">Exportar copia JSON</button><label class="btn btn-secondary" for="importBackup">Importar copia JSON</label><input class="hidden" type="file" id="importBackup" accept="application/json"><button class="btn btn-danger" id="resetDemo">Restablecer datos</button></div></div><div class="card"><div class="section-title"><div><h2>Conexión de producción</h2></div></div><div class="notice warn"><b>Modo actual:</b> operación local en este navegador. Se incluyeron archivos de reglas, índices y configuración de ejemplo, pero no se activó Firebase porque no se recibió un proyecto autorizado para esta distribuidora.</div><div class="notice" style="margin-top:12px">Para producción multiusuario se debe añadir el proyecto Firebase propio, crear usuarios reales y desplegar reglas e índices. No se mezcló ninguna base de datos anterior.</div></div></div></div>`;document.getElementById('settingsForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));data.defaultDeliveryCost=num(data.defaultDeliveryCost);Object.assign(DB.settings,data);audit('ACTUALIZAR','Configuración','settings','Datos comerciales');if(safeSave('Configuración guardada.')){renderSession();renderSettings();}});document.getElementById('exportBackup').addEventListener('click',()=>downloadText(JSON.stringify(DB,null,2),`respaldo_repuestos_${todayKey()}.json`,'application/json'));document.getElementById('importBackup').addEventListener('change',importBackup);document.getElementById('resetDemo').addEventListener('click',()=>{if(confirm('¿Restablecer todos los datos de esta versión? Esta acción no se puede deshacer.')){DB=defaultDB();safeSave('Datos restablecidos.');navigate('dashboard');}});}
function importBackup(event){const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const imported=normalizeDB(JSON.parse(reader.result));if(!confirm(`¿Importar copia con ${imported.clients.length} clientes y ${imported.orders.length} pedidos?`))return;DB=imported;safeSave('Copia importada correctamente.');navigate('dashboard');}catch(error){console.error(error);toast('El archivo no contiene una copia válida.','danger');}};reader.readAsText(file);}

/* =========================
   C1.8 · FIREBASE Y OPERACIÓN MULTIUSUARIO
   ========================= */

function firebaseErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos. Las cuentas locales de prueba no sirven en Firebase; usa una cuenta creada en Authentication.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ese correo ya tiene una cuenta en Firebase.',
    'auth/weak-password': 'La contraseña debe tener al menos seis caracteres.',
    'auth/invalid-email': 'El correo no tiene un formato válido.',
    'auth/too-many-requests': 'Se bloquearon temporalmente los intentos. Espera unos minutos.',
    'auth/network-request-failed': 'No fue posible comunicarse con Firebase. Revisa internet.',
    'permission-denied': 'La operación fue rechazada por las reglas de Firestore. Publica las reglas C1.8 y confirma que la cuenta tenga un perfil en usuariosSistema.'
  };
  return messages[code] || error?.message || 'No fue posible completar la operación.';
}

function updateCloudStatus(info = {}) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  el.classList.remove('online', 'syncing', 'offline', 'error');
  const state = info.state || (navigator.onLine ? 'ready' : 'offline');
  const labels = {
    ready: '● Firebase listo', online: '● Conectado', synced: '● Sincronizado',
    syncing: '↻ Sincronizando', offline: '● Sin conexión', error: '⚠ Error de sincronización'
  };
  el.textContent = labels[state] || '● Firebase';
  el.classList.add(state === 'ready' || state === 'online' || state === 'synced' ? 'online' : state);
  if (info.detail) el.title = info.detail;
}

async function boot() {
  bindBaseEvents();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(registration => registration.update()).catch(error => console.warn('Service worker:', error));
  showLogin();
  Cloud.onStatus(updateCloudStatus);
  try {
    await Cloud.init();
    Cloud.onAuthChanged(handleFirebaseAuthState);
  } catch (error) {
    console.error(error);
    const message = document.getElementById('loginMessage');
    message.textContent = firebaseErrorMessage(error);
    updateCloudStatus({ state: 'error', detail: error.message });
  }
}

function bindBaseEvents() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('setupAdminButton').addEventListener('click', openInitialAdminSetup);
  document.getElementById('resetPasswordButton').addEventListener('click', requestPasswordReset);
  document.getElementById('loginPasswordToggle').addEventListener('click', () => {
    const input = document.getElementById('loginPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
    document.getElementById('loginPasswordToggle').textContent = input.type === 'password' ? '👁️ Ver' : '🙈 Ocultar';
  });
  document.getElementById('logoutButton').addEventListener('click', logout);
  document.getElementById('mobileMenuButton').addEventListener('click', () => toggleMenu(true));
  document.getElementById('desktopSidebarToggle').addEventListener('click', toggleSidebarDesktop);
  document.getElementById('overlay').addEventListener('click', () => toggleMenu(false));
  document.getElementById('modalBackdrop').addEventListener('click', event => { if (event.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
}

async function requestPasswordReset() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const message = document.getElementById('loginMessage');
  if (!email) {
    message.textContent = 'Escribe primero el correo de la cuenta.';
    document.getElementById('loginEmail').focus();
    return;
  }
  const button = document.getElementById('resetPasswordButton');
  button.disabled = true;
  button.textContent = 'Enviando…';
  try {
    await Cloud.sendPasswordReset(email);
    message.textContent = 'Se envió el enlace para restablecer la contraseña. Revisa también la carpeta de correo no deseado.';
  } catch (error) {
    console.error(error);
    message.textContent = firebaseErrorMessage(error);
  } finally {
    button.disabled = false;
    button.textContent = '¿Olvidaste la contraseña?';
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const message = document.getElementById('loginMessage');
  const button = event.currentTarget.querySelector('button[type="submit"]');
  message.textContent = '';
  button.disabled = true;
  button.textContent = 'Ingresando…';
  try {
    await Cloud.signIn(email, password);
  } catch (error) {
    console.error(error);
    message.textContent = firebaseErrorMessage(error);
  } finally {
    button.disabled = false;
    button.textContent = 'Ingresar al sistema';
  }
}

async function handleFirebaseAuthState(user) {
  if (!user) {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
    return;
  }
  try {
    updateCloudStatus({ state: 'syncing' });
    const profile = await Cloud.setCurrentUser(user);
    if (!profile) {
      document.getElementById('loginMessage').textContent = 'La cuenta existe, pero no tiene un perfil autorizado en el sistema.';
      await Cloud.signOut();
      return;
    }
    if (profile.status !== 'Activo') {
      document.getElementById('loginMessage').textContent = 'Este usuario está inactivo. Contacta al administrador.';
      await Cloud.signOut();
      return;
    }

    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: profile.id || user.uid, startedAt: nowIso() }));
    const cloudData = await Cloud.loadAll();
    if (!cloudData.hasBusinessData) {
      DB = productionEmptyDB(profile);
      await Cloud.uploadFullDB(DB);
    } else {
      DB = normalizeDB(cloudData);
      const profileIndex = DB.users.findIndex(item => item.id === profile.id || item.uid === user.uid);
      if (profileIndex >= 0) DB.users[profileIndex] = { ...DB.users[profileIndex], ...profile, id: profile.id || user.uid };
      else DB.users.push({ ...profile, id: profile.id || user.uid });
    }
    recalcAgainst(DB);
    saveDB({ skipCloud: true });
    Cloud.startRealtime(applyRemoteCollection);
    ui.route = 'dashboard';
    showApp();
    updateCloudStatus({ state: navigator.onLine ? 'synced' : 'offline' });
  } catch (error) {
    console.error(error);
    document.getElementById('loginMessage').textContent = firebaseErrorMessage(error);
    updateCloudStatus({ state: 'error', detail: error.message });
    await Cloud.signOut().catch(() => {});
  }
}

function applyRemoteCollection(key, value) {
  if (!Cloud.user) return;
  Cloud.applyingRemote = true;
  try {
    if (key === 'settings') DB.settings = { ...DB.settings, ...(value || {}) };
    else if (key === 'counters') DB.counters = { ...DB.counters, ...(value || {}) };
    else if (Array.isArray(value)) DB[key] = value;
    recalcAgainst(DB);
    saveDB({ skipCloud: true });
  } finally {
    Cloud.applyingRemote = false;
  }
  clearTimeout(window.__marRemoteRenderTimer);
  window.__marRemoteRenderTimer = setTimeout(() => {
    const modalOpen = !document.getElementById('modalBackdrop').classList.contains('hidden');
    const editingOrder = ui.route === 'orderNew' && ui.orderCart.length > 0;
    if (!modalOpen && !editingOrder && !document.getElementById('app').classList.contains('auth-hidden')) renderRoute();
    renderSession();
  }, 350);
}

async function logout() {
  try { await Cloud.signOut(); }
  catch (error) { console.error(error); }
  sessionStorage.removeItem(SESSION_KEY);
  showLogin();
}

function renderSession() {
  const user = currentUser() || Cloud.profile;
  document.getElementById('userSession').textContent = `${user?.name || 'Usuario'} · ${user?.role || ''}`;
  document.getElementById('brandName').textContent = DB.settings.businessName || 'Comercializadora MAR';
  updateCloudStatus({ state: !navigator.onLine ? 'offline' : Cloud.syncInFlight ? 'syncing' : 'synced' });
}

function showInitialAdminSuccess(admin) {
  openModal(`<div class="admin-created-panel">
    <div class="success-icon">✓</div>
    <h2>Usuario administrador creado</h2>
    <p class="lead">La cuenta <b>${esc(admin.email)}</b> fue registrada correctamente.</p>
    <div class="notice warn" style="margin-top:16px"><b>Administrador oficial:</b> desde este momento esta cuenta es el administrador principal de Comercializadora MAR y tendrá acceso total a usuarios, inventario, pedidos, cartera, reportes y configuración.</div>
    <div class="notice" style="margin-top:12px">Guarda el correo y la contraseña en un lugar seguro. El sistema cerró la sesión de configuración para comprobar el acceso normal desde el inicio de sesión.</div>
    <div class="admin-created-summary"><span>Nombre</span><b>${esc(admin.name)}</b><span>Correo</span><b>${esc(admin.email)}</b><span>Rol</span><b>Administrador</b></div>
    <div class="actions" style="margin-top:18px"><button class="btn btn-primary" id="continueToLoginButton" type="button">Continuar</button></div>
  </div>`, { locked: true });

  document.getElementById('continueToLoginButton').addEventListener('click', () => {
    forceCloseModal();
    showLogin();
    document.getElementById('loginEmail').value = admin.email;
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginMessage').textContent = 'Administrador oficial creado. Ingresa con el correo y la contraseña registrados.';
    document.getElementById('loginPassword').focus();
  });
}

async function openInitialAdminSetup() {
  try {
    const state = await Cloud.getSystemState();
    if (state?.initialized) {
      openModal(`<div class="modal-head"><div><h2>La configuración inicial ya existe</h2><p class="muted">El proyecto ${esc(EXPECTED_FIREBASE_PROJECT)} continúa marcado como configurado.</p></div><button class="modal-close" data-close-modal>×</button></div>
        <div class="notice warn"><b>Importante:</b> eliminar el usuario en Firebase Authentication no elimina la configuración inicial guardada en Firestore.</div>
        <p style="margin-top:14px">Para repetir la prueba desde cero, elimina manualmente en Firestore:</p>
        <div class="recovery-paths"><code>configuracion/sistema</code><code>usuariosSistema/${esc(state.initializedBy || 'UID_DEL_ADMIN_ANTERIOR')}</code></div>
        <div class="notice danger" style="margin-top:14px">Hazlo únicamente si estás seguro de que deseas reiniciar el administrador oficial. No se ofrece un botón público de reinicio porque sería un riesgo de seguridad.</div>
        <div class="actions" style="margin-top:16px"><button class="btn btn-secondary" type="button" data-close-modal>Cerrar</button></div>`);
      bindCloseModal();
      return;
    }
  } catch (error) {
    console.error(error);
  }
  openModal(`<div class="modal-head"><div><h2>Administrador inicial</h2><p class="muted">Esta opción funciona una sola vez en el proyecto ${esc(EXPECTED_FIREBASE_PROJECT)}.</p></div><button class="modal-close" data-close-modal>×</button></div>
    <form id="initialAdminForm"><div class="form-grid">
      <div class="field full"><label>Nombre completo *</label><input class="input" name="name" required></div>
      <div class="field full"><label>Correo administrativo *</label><input class="input" type="email" name="email" required></div>
      <div class="field full"><label>Contraseña *</label><input class="input" type="password" name="password" minlength="6" required><span class="help">Mínimo seis caracteres.</span></div>
    </div><div class="notice warn" style="margin-top:14px">Usa un correo real de la empresa. Esta cuenta quedará registrada como administrador oficial y tendrá acceso total.</div>
    <div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Crear administrador oficial</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);
  bindCloseModal();
  document.getElementById('initialAdminForm').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Creando administrador…';
    try {
      const admin = await Cloud.bootstrapAdmin(data);
      showInitialAdminSuccess(admin);
    } catch (error) {
      console.error(error);
      toast(firebaseErrorMessage(error), 'danger');
      button.disabled = false;
      button.textContent = 'Crear administrador oficial';
    }
  });
}

function buildOrderDraftData(data) {
  const { client, subtotal, deliveryCost, total } = data;
  return {
    id: id('ord'), clientId: client.id, clientName: client.businessName, clientDocument: client.document || '',
    clientWhatsapp: client.whatsapp || client.phone || '', clientAddress: client.address || '', clientCity: client.city || '',
    priceList: client.priceList, paymentMethod: document.getElementById('orderPayment').value,
    dueDate: document.getElementById('orderDueDate').value, deliveryType: document.getElementById('orderDelivery').value,
    deliveryCost, notes: document.getElementById('orderNotes').value.trim(),
    items: ui.orderCart.map(item => ({ ...item, lineTotal: num(item.price) * num(item.quantity) })),
    subtotal, discount: 0, tax: 0, total, paid: 0, balance: total, returnCredit: 0,
    paymentStatus: 'Pendiente', assignedTo: '', dispatchDate: '', inventoryCommitted: true
  };
}

async function confirmOrder() {
  const data = validateOrderData();
  if (!data) return;
  if (!Cloud.user) return toast('Debes iniciar sesión en Firebase.', 'danger');
  const button = document.getElementById('confirmOrder');
  button.disabled = true;
  button.textContent = 'Confirmando inventario…';
  try {
    const draft = buildOrderDraftData(data);
    const result = await Cloud.createOrderAtomic(draft, data.paid);
    result.productStocks.forEach(item => {
      const product = productById(item.productId);
      if (product) product.stock = item.stock;
    });
    DB.orders.unshift(result.order);
    if (result.payment) DB.payments.unshift(result.payment);
    DB.inventoryMovements.unshift(...result.movements);
    DB.counters.orders = result.counters.orders;
    DB.counters.payments = result.counters.payments;
    if (ui.sourceDraftId) {
      const source = orderById(ui.sourceDraftId);
      if (source?.status === 'Borrador') {
        source.status = 'Convertido';
        source.convertedTo = result.order.id;
        source.updatedAt = nowIso();
      }
    }
    recalcClientBalance(result.order.clientId);
    audit('CREAR', 'Pedido', result.order.id, result.order.number);
    saveDB();
    try { await ensureOrderPdf(result.order); }
    catch (pdfError) { console.error(pdfError); toast('El pedido se guardó; la factura se regenerará al abrirla.', 'warn'); }
    ui.orderCart = [];
    ui.sourceDraftId = '';
    showOrderSuccess(result.order);
  } catch (error) {
    console.error(error);
    toast(firebaseErrorMessage(error), 'danger');
  } finally {
    button.disabled = false;
    button.textContent = '✅ Confirmar y generar factura';
  }
}

function saveOrderDraft() {
  const data = validateOrderData();
  if (!data) return;
  const existing = ui.sourceDraftId ? orderById(ui.sourceDraftId) : null;
  const draftData = buildOrderDraftData(data);
  const draft = existing?.status === 'Borrador' ? existing : {
    id: id('draft'), number: `BOR-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`,
    createdAt: nowIso(), createdBy: currentUserEmail()
  };
  Object.assign(draft, draftData, {
    status: 'Borrador', paymentStatus: 'Borrador', paid: 0, balance: 0,
    proposedPayment: data.paid, inventoryCommitted: false, updatedAt: nowIso(),
    pdf: { generated: false, version: 1, fileName: `${draft.number}.pdf`, storage: 'firestore-base64' }
  });
  if (!existing) DB.orders.unshift(draft);
  audit(existing ? 'ACTUALIZAR' : 'CREAR', 'Borrador', draft.id, draft.number);
  if (safeSave('Borrador guardado sin descontar inventario.')) {
    ui.orderCart = [];
    ui.sourceDraftId = '';
    navigate('orders');
  }
}

function repeatOrder(orderId) {
  const order = orderById(orderId);
  if (!order) return;
  ui.selectedClientId = order.clientId;
  ui.sourceDraftId = order.status === 'Borrador' ? order.id : '';
  ui.orderCart = (order.items || []).map(item => {
    const product = productById(item.productId);
    return { ...item, stock: num(product?.stock), quantity: Math.min(num(item.quantity), num(product?.stock)), price: num(product?.prices?.[clientById(order.clientId)?.priceList] ?? item.price) };
  }).filter(item => item.quantity > 0);
  navigate('orderNew');
  toast(order.status === 'Borrador' ? 'Borrador cargado para editar y confirmar.' : 'Pedido anterior cargado. Revisa cantidades y precios.', 'ok');
}

async function openPaymentModal(orderId) {
  const order = orderById(orderId);
  if (!order || order.balance <= 0) return toast('El pedido no tiene saldo pendiente.', 'warn');
  openModal(`<div class="modal-head"><div><h2>Registrar pago o abono</h2><p class="muted">${esc(order.number)} · ${esc(order.clientName)}</p></div><button class="modal-close" data-close-modal>×</button></div>
    <div class="summary-box"><div class="summary-row"><span>Total vigente</span><b>${money(orderEffectiveTotal(order))}</b></div><div class="summary-row"><span>Pagado</span><b>${money(order.paid)}</b></div><div class="summary-row total"><span>Saldo</span><span>${money(order.balance)}</span></div></div>
    <form id="paymentForm" style="margin-top:14px"><div class="form-grid">
      <div class="field"><label>Valor recibido *</label><input class="input" type="number" name="amount" min="1" max="${order.balance}" step="1000" value="${order.balance}" required></div>
      <div class="field"><label>Método</label><select class="select" name="method"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Consignación</option><option>Pago combinado</option></select></div>
      <div class="field"><label>Referencia</label><input class="input" name="reference" placeholder="Comprobante o transacción"></div>
      <div class="field"><label>Fecha</label><input class="input" type="date" name="date" value="${todayKey()}"></div>
      <div class="field full"><label>Observación</label><textarea class="textarea" name="notes"></textarea></div>
    </div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar pago</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);
  bindCloseModal();
  document.getElementById('paymentForm').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const amount = num(data.amount);
    if (amount <= 0 || amount > num(order.balance)) return toast('El valor debe ser mayor a cero y no superar el saldo.', 'danger');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Registrando…';
    try {
      const result = await Cloud.registerPaymentAtomic(order, amount, data.method, data.reference, data.notes, data.date);
      DB.payments.unshift(result.payment);
      DB.counters.payments = result.paymentCounter;
      order.paid = result.newPaid;
      order.balance = result.newBalance;
      order.paymentStatus = result.paymentStatus;
      const nextVersion = num(order.pdf?.version || 1) + 1;
      order.pdf = { generated: false, version: nextVersion, fileName: `FACTURA_COMPRA_${order.number}-V${nextVersion}.pdf`, layoutVersion: 2, storage: 'firestore-base64' };
      order.updatedAt = nowIso();
      recalcClientBalance(order.clientId);
      const pendingPromise = DB.paymentPromises.filter(item => item.orderId === order.id && item.status === 'Pendiente').sort((a,b) => String(a.promiseDate).localeCompare(String(b.promiseDate)))[0];
      if (pendingPromise) {
        pendingPromise.amountApplied = num(pendingPromise.amountApplied) + num(result.payment.amount);
        pendingPromise.lastPaymentId = result.payment.id;
        pendingPromise.updatedAt = nowIso();
        if (pendingPromise.amountApplied >= num(pendingPromise.amount) || order.balance <= 0) pendingPromise.status = 'Cumplida';
      }
      audit('REGISTRAR', 'Pago', result.payment.id, `${result.payment.number} · ${order.number}`);
      saveDB();
      closeModal();
      showPaymentSuccess(result.payment, order);
      renderRoute();
    } catch (error) {
      console.error(error);
      toast(firebaseErrorMessage(error), 'danger');
      button.disabled = false;
      button.textContent = 'Guardar pago';
    }
  });
}

function showPaymentSuccess(payment, order) {
  openModal(`<div class="modal-head"><div><div class="success-icon">✓</div><h2>Pago registrado</h2><p class="muted">${esc(payment.number)} · ${esc(order.number)}</p></div><button class="modal-close" data-close-modal>×</button></div>
    <div class="summary-box"><div class="summary-row"><span>Valor recibido</span><b>${money(payment.amount)}</b></div><div class="summary-row"><span>Método</span><b>${esc(payment.method)}</b></div><div class="summary-row total"><span>Nuevo saldo</span><span>${money(order.balance)}</span></div></div>
    <div class="actions" style="margin-top:16px"><button class="btn btn-info" id="viewPaymentReceipt">Ver recibo PDF</button><button class="btn btn-success" id="sharePaymentReceipt">Enviar recibo por WhatsApp</button><button class="btn btn-secondary" data-close-modal>Cerrar</button></div>`);
  bindCloseModal();
  document.getElementById('viewPaymentReceipt').addEventListener('click', () => viewPaymentReceiptPdf(payment.id));
  document.getElementById('sharePaymentReceipt').addEventListener('click', () => sharePaymentReceiptWhatsApp(payment.id));
}

async function cancelOrder(orderId) {
  const order = orderById(orderId);
  if (!order || ['Cancelado','Convertido'].includes(order.status)) return;
  if (order.status === 'Borrador') {
    if (!confirm(`¿Cancelar el borrador ${order.number}?`)) return;
    order.status = 'Cancelado';
    order.updatedAt = nowIso();
    audit('CANCELAR', 'Borrador', order.id, order.number);
    if (safeSave('Borrador cancelado.')) { closeModal(); renderOrders(); }
    return;
  }
  if (!confirm(`¿Cancelar ${order.number}? El inventario regresará a existencias.`)) return;
  try {
    const result = await Cloud.cancelOrderAtomic(order);
    result.productStocks.forEach(item => { const product = productById(item.productId); if (product) product.stock = item.stock; });
    DB.inventoryMovements.unshift(...result.movements);
    order.status = 'Cancelado';
    order.updatedAt = nowIso();
    recalcClientBalance(order.clientId);
    invalidateOrderPdf(order);
    audit('CANCELAR', 'Pedido', order.id, order.number);
    saveDB();
    closeModal();
    renderOrders();
    toast('Pedido cancelado e inventario restaurado.', 'ok');
  } catch (error) {
    console.error(error);
    toast(firebaseErrorMessage(error), 'danger');
  }
}

function openPaymentPromiseModal(clientId) {
  const client = clientById(clientId);
  const pending = DB.orders.filter(order => order.clientId === clientId && order.balance > 0 && !['Cancelado','Borrador','Convertido'].includes(order.status));
  if (!client || !pending.length) return toast('El cliente no tiene cartera pendiente.', 'warn');
  openModal(`<div class="modal-head"><div><h2>Promesa de pago</h2><p class="muted">${esc(client.businessName)}</p></div><button class="modal-close" data-close-modal>×</button></div>
    <form id="promiseForm"><div class="form-grid">
      <div class="field full"><label>Pedido</label><select class="select" name="orderId">${pending.map(order => `<option value="${order.id}">${order.number} · ${money(order.balance)}</option>`).join('')}</select></div>
      <div class="field"><label>Fecha comprometida *</label><input class="input" type="date" name="promiseDate" min="${todayKey()}" required></div>
      <div class="field"><label>Valor prometido *</label><input class="input" type="number" name="amount" min="1" value="${pending[0].balance}" required></div>
      <div class="field full"><label>Observación</label><textarea class="textarea" name="notes"></textarea></div>
    </div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar promesa</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);
  bindCloseModal();
  document.getElementById('promiseForm').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const order = orderById(data.orderId);
    const promise = { id: id('promise'), clientId, clientName: client.businessName, orderId: order.id, orderNumber: order.number, amount: Math.min(num(data.amount), num(order.balance)), promiseDate: data.promiseDate, notes: data.notes, status: 'Pendiente', createdAt: nowIso(), createdBy: currentUserEmail() };
    DB.paymentPromises.unshift(promise);
    audit('CREAR', 'Promesa de pago', promise.id, `${promise.orderNumber} · ${promise.promiseDate}`);
    if (safeSave('Promesa de pago registrada.')) { closeModal(); renderPortfolio(); }
  });
}

function portfolioAging() {
  const now = new Date();
  const buckets = { current: 0, d30: 0, d60: 0, older: 0 };
  DB.orders.filter(order => order.balance > 0 && !['Cancelado','Borrador','Convertido'].includes(order.status)).forEach(order => {
    if (!order.dueDate) { buckets.current += num(order.balance); return; }
    const due = new Date(`${order.dueDate}T23:59:59`);
    const days = Math.floor((now - due) / 86400000);
    if (days <= 0) buckets.current += num(order.balance);
    else if (days <= 30) buckets.d30 += num(order.balance);
    else if (days <= 60) buckets.d60 += num(order.balance);
    else buckets.older += num(order.balance);
  });
  return buckets;
}

function importCsvRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index], next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index++;
      row.push(cell.trim()); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map(value => value.toLowerCase().replace(/\s+/g, '_'));
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function importClientsCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = importCsvRows(String(reader.result || ''));
      if (!rows.length) throw new Error('El archivo no tiene registros.');
      let created = 0, updated = 0;
      rows.forEach(row => {
        const businessName = row.negocio || row.nombre || row.businessname;
        if (!businessName) return;
        const documentValue = row.nit || row.documento || '';
        let client = DB.clients.find(item => documentValue && item.document === documentValue) || DB.clients.find(item => item.businessName.toLowerCase() === businessName.toLowerCase());
        const data = {
          businessName, type: row.tipo || 'Almacén de repuestos', contactName: row.contacto || '', document: documentValue,
          phone: row.telefono || '', whatsapp: row.whatsapp || row.telefono || '', city: row.ciudad || '', zone: row.zona || '', address: row.direccion || '',
          priceList: ['general','mayorista','distribuidor','especial'].includes((row.lista_precio || '').toLowerCase()) ? row.lista_precio.toLowerCase() : 'mayorista',
          paymentTerms: row.condicion_pago || 'Contado', creditDays: num(row.dias_credito), creditLimit: num(row.cupo_credito),
          status: row.estado || 'Activo', notes: row.notas || '', updatedAt: nowIso()
        };
        if (client) { Object.assign(client, data); updated++; }
        else { client = { ...data, id: id('cli'), code: nextNumber('clients','CLI'), currentBalance: 0, sellerId: currentUser()?.id || '', createdAt: nowIso() }; DB.clients.push(client); created++; }
      });
      audit('IMPORTAR', 'Clientes', id('import'), `${created} creados · ${updated} actualizados`);
      safeSave(`Importación terminada: ${created} clientes creados y ${updated} actualizados.`);
      renderSettings();
    } catch (error) { console.error(error); toast(error.message || 'No se pudo importar clientes.', 'danger'); }
  };
  reader.readAsText(file, 'UTF-8');
}

function importProductsCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = importCsvRows(String(reader.result || ''));
      if (!rows.length) throw new Error('El archivo no tiene registros.');
      let created = 0, updated = 0;
      rows.forEach(row => {
        const code = row.codigo || row.code;
        const name = row.producto || row.nombre || row.name;
        if (!code || !name) return;
        let product = DB.products.find(item => item.code.toLowerCase() === code.toLowerCase());
        const data = {
          code, barcode: row.codigo_barras || '', name, brand: row.marca || '', category: row.categoria || 'Repuestos',
          segment: row.segmento || 'Carros y motos', viscosity: row.viscosidad || '', presentation: row.presentacion || 'Unidad', unit: row.unidad || 'Unidad',
          unitsPerCase: num(row.unidades_caja) || 1, location: row.ubicacion || '', stock: num(row.stock), minStock: num(row.stock_minimo), cost: num(row.costo),
          prices: { general: num(row.precio_general), mayorista: num(row.precio_mayorista), distribuidor: num(row.precio_distribuidor) },
          status: row.estado || 'Activo', updatedAt: nowIso()
        };
        if (product) { Object.assign(product, data); updated++; }
        else { product = { ...data, id: id('pro'), supplierId: '', createdAt: nowIso() }; DB.products.push(product); DB.counters.products = num(DB.counters.products) + 1; created++; }
      });
      audit('IMPORTAR', 'Productos', id('import'), `${created} creados · ${updated} actualizados`);
      safeSave(`Importación terminada: ${created} productos creados y ${updated} actualizados.`);
      renderSettings();
    } catch (error) { console.error(error); toast(error.message || 'No se pudo importar productos.', 'danger'); }
  };
  reader.readAsText(file, 'UTF-8');
}

async function migrateC12ToFirebase() {
  if (currentRole() !== 'Administrador') return toast('Solo el administrador puede migrar información.', 'danger');
  const raw = localStorage.getItem('repuestos_distribuidor_c1_2');
  if (!raw) return toast('No se encontró información local de la versión C1.2 en este navegador.', 'warn');
  try {
    const legacy = normalizeDB(JSON.parse(raw));
    legacy.orders.forEach(order => {
      const returnedQuantities = {};
      legacy.returns.filter(item => item.orderId === order.id && item.status !== 'Anulada').forEach(item => {
        returnedQuantities[item.productId] = num(returnedQuantities[item.productId]) + num(item.quantity);
      });
      order.returnedQuantities = returnedQuantities;
      order.totalReturns = legacy.returns.filter(item => item.orderId === order.id && item.status !== 'Anulada').reduce((sum, item) => sum + num(item.creditAmount), 0);
    });
    if (!confirm(`Se subirán ${legacy.clients.length} clientes, ${legacy.products.length} productos y ${legacy.orders.length} pedidos a Firebase. ¿Continuar?`)) return;
    await Cloud.uploadFullDB(legacy);
    DB = legacy;
    const profile = Cloud.profile;
    if (profile && !DB.users.some(user => user.id === profile.id)) DB.users.push(profile);
    saveDB({ skipCloud: true });
    toast('Migración a Firebase completada.', 'ok');
    navigate('dashboard');
  } catch (error) {
    console.error(error);
    toast(firebaseErrorMessage(error), 'danger');
  }
}

function renderUsers() {
  document.getElementById('view').innerHTML = `<div class="card"><div class="section-title"><div><h2>Usuarios y roles</h2><p>Cuentas reales de Firebase Authentication y perfiles protegidos en Firestore.</p></div><button class="btn btn-primary" id="newUser">＋ Crear usuario</button></div>
    <div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${DB.users.map(user => `<tr><td><b>${esc(user.name)}</b>${user.officialAdmin ? '<div><span class="badge info" style="margin-top:5px">Administrador oficial</span></div>' : ''}</td><td>${esc(user.email)}</td><td>${esc(user.role)}</td><td>${statusBadge(user.status)}</td><td><button class="btn btn-secondary btn-sm" data-edit-user="${user.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>
    <div class="notice" style="margin-top:14px">Las contraseñas se administran en Firebase Authentication y nunca se guardan en Firestore ni en el navegador. La cuenta marcada como administrador oficial no puede degradarse, desactivarse ni eliminarse desde el sistema.</div></div>`;
  document.getElementById('newUser').addEventListener('click', () => openUserForm());
  document.querySelectorAll('[data-edit-user]').forEach(button => button.addEventListener('click', () => openUserForm(button.dataset.editUser)));
}

function openUserForm(userId = '') {
  const user = DB.users.find(item => item.id === userId) || { name: '', email: '', role: 'Vendedor', status: 'Activo' };
  const isOfficialAdmin = Boolean(userId && user.officialAdmin);
  openModal(`<div class="modal-head"><div><h2>${userId ? 'Editar usuario' : 'Crear usuario'}</h2><p class="muted">${isOfficialAdmin ? 'La cuenta oficial solo permite actualizar el nombre.' : userId ? 'Actualiza rol y estado.' : 'Se creará una cuenta real en Firebase Authentication.'}</p></div><button class="modal-close" data-close-modal>×</button></div>
    <form id="userForm"><div class="form-grid">
      <div class="field"><label>Nombre *</label><input class="input" name="name" value="${esc(user.name)}" required></div>
      <div class="field"><label>Correo *</label><input class="input" type="email" name="email" value="${esc(user.email)}" ${userId ? 'readonly' : ''} required></div>
      ${userId ? '' : '<div class="field"><label>Contraseña temporal *</label><input class="input" type="password" name="password" minlength="6" required></div>'}
      ${isOfficialAdmin ? '<input type="hidden" name="role" value="Administrador"><div class="field"><label>Rol</label><input class="input" value="Administrador oficial" disabled></div>' : `<div class="field"><label>Rol</label><select class="select" name="role">${Object.keys(ROLE_PERMISSIONS).map(role => `<option ${user.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select></div>`}
      ${isOfficialAdmin ? '<input type="hidden" name="status" value="Activo"><div class="field"><label>Estado</label><input class="input" value="Activo (protegido)" disabled></div>' : `<div class="field"><label>Estado</label><select class="select" name="status"><option ${user.status === 'Activo' ? 'selected' : ''}>Activo</option><option ${user.status === 'Inactivo' ? 'selected' : ''}>Inactivo</option></select></div>`}
    </div>${isOfficialAdmin ? '<div class="notice warn" style="margin-top:14px">Esta cuenta es el administrador oficial creado durante la configuración inicial. Su rol y estado están protegidos.</div>' : ''}<div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar usuario</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);
  bindCloseModal();
  document.getElementById('userForm').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (userId) {
        await Cloud.updateUserProfile(userId, data);
        Object.assign(user, { name: data.name, role: data.role, status: data.status, updatedAt: nowIso() });
      } else {
        const uid = await Cloud.createUserAccount(data);
        DB.users.push({ id: uid, uid, name: data.name, email: data.email.toLowerCase(), role: data.role, status: data.status, createdAt: nowIso() });
      }
      saveDB({ skipCloud: true });
      closeModal();
      renderUsers();
      toast('Usuario guardado en Firebase.', 'ok');
    } catch (error) {
      console.error(error);
      toast(firebaseErrorMessage(error), 'danger');
      button.disabled = false;
    }
  });
}

/* Mejoras sobre vistas existentes */
var renderDashboardC12 = renderDashboard;
renderDashboard = function renderDashboardC13() {
  renderDashboardC12();
  const activeOrders = DB.orders.filter(order => !['Cancelado','Borrador','Convertido'].includes(order.status));
  const overdueCount = activeOrders.filter(order => paymentStatusFor(order) === 'Vencido').length;
  const pendingDispatch = activeOrders.filter(order => !['Entregado'].includes(order.status)).length;
  const lowStock = DB.products.filter(product => num(product.stock) <= num(product.minStock)).length;
  const promiseDue = DB.paymentPromises.filter(promise => promise.status === 'Pendiente' && promise.promiseDate <= todayKey()).length;
  const inactiveClients = DB.clients.filter(client => {
    if (client.id === 'cli_general') return false;
    const last = activeOrders.filter(order => order.clientId === client.id).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    return !last || (Date.now() - new Date(last.createdAt).getTime()) / 86400000 > 60;
  }).length;
  const alertCard = `<div class="card alert-center" style="margin-bottom:16px"><div class="section-title"><div><h2>Centro de alertas</h2><p>Prioridades comerciales, de cartera e inventario.</p></div></div><div class="alert-grid">
    <button class="alert-item ${overdueCount ? 'critical' : ''}" data-go="portfolio"><b>${overdueCount}</b><span>Pedidos vencidos</span></button>
    <button class="alert-item ${promiseDue ? 'critical' : ''}" data-go="portfolio"><b>${promiseDue}</b><span>Promesas por atender</span></button>
    <button class="alert-item ${lowStock ? 'warning' : ''}" data-go="products"><b>${lowStock}</b><span>Productos por reponer</span></button>
    <button class="alert-item ${pendingDispatch ? 'warning' : ''}" data-go="dispatches"><b>${pendingDispatch}</b><span>Despachos pendientes</span></button>
    <button class="alert-item" data-go="clients"><b>${inactiveClients}</b><span>Clientes sin comprar +60 días</span></button>
  </div></div>`;
  document.getElementById('view').insertAdjacentHTML('afterbegin', alertCard);
  bindGoButtons();
};

var renderPortfolioC12 = renderPortfolio;
renderPortfolio = function renderPortfolioC13() {
  renderPortfolioC12();
  const aging = portfolioAging();
  const promises = DB.paymentPromises.filter(item => item.status === 'Pendiente').sort((a,b) => String(a.promiseDate).localeCompare(String(b.promiseDate))).slice(0, 10);
  const html = `<div class="grid grid-4" style="margin-bottom:16px">${statCard('Por vencer', money(aging.current), '🟢')}${statCard('Vencida 1–30 días', money(aging.d30), '🟡')}${statCard('Vencida 31–60 días', money(aging.d60), '🟠')}${statCard('Más de 60 días', money(aging.older), '🔴')}</div>
    <div class="card" style="margin-bottom:16px"><div class="section-title"><div><h2>Promesas de pago</h2><p>Compromisos próximos y vencidos.</p></div></div>${promises.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Pedido</th><th class="money">Valor</th><th>Estado</th></tr></thead><tbody>${promises.map(promise => `<tr><td>${dateOnly(promise.promiseDate)}</td><td>${esc(promise.clientName)}</td><td>${esc(promise.orderNumber)}</td><td class="money"><b>${money(promise.amount)}</b></td><td>${statusBadge(promise.promiseDate < todayKey() ? 'Vencido' : promise.status)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('No hay promesas pendientes.')}</div>`;
  document.getElementById('view').insertAdjacentHTML('afterbegin', html);
  document.querySelectorAll('[data-portfolio-view]').forEach(button => {
    const clientId = button.dataset.portfolioView;
    const actions = button.closest('.actions');
    if (actions && !actions.querySelector(`[data-portfolio-promise="${clientId}"]`)) {
      actions.insertAdjacentHTML('afterbegin', `<button class="btn btn-outline btn-sm" data-portfolio-promise="${clientId}">Promesa</button>`);
    }
  });
  document.querySelectorAll('[data-portfolio-promise]').forEach(button => button.addEventListener('click', () => openPaymentPromiseModal(button.dataset.portfolioPromise)));
};

var viewClientC12 = viewClient;
viewClient = function viewClientC13(clientId) {
  viewClientC12(clientId);
  const client = clientById(clientId);
  if (!client) return;
  const actions = [...document.querySelectorAll('#modalCard .actions')].pop();
  if (!actions) return;
  actions.insertAdjacentHTML('beforeend', `<button class="btn btn-info" id="clientStatementPdf">Estado de cuenta PDF</button><button class="btn btn-success" id="clientStatementWa">Enviar estado por WhatsApp</button>${client.currentBalance > 0 ? '<button class="btn btn-warning" id="clientPromise">Promesa de pago</button>' : ''}`);
  document.getElementById('clientStatementPdf').addEventListener('click', () => viewClientStatementPdf(clientId));
  document.getElementById('clientStatementWa').addEventListener('click', () => shareClientStatementWhatsApp(clientId));
  document.getElementById('clientPromise')?.addEventListener('click', () => openPaymentPromiseModal(clientId));
};

var renderPurchasesC12 = renderPurchases;
renderPurchases = function renderPurchasesC13() {
  renderPurchasesC12();
  const suggested = DB.products.filter(product => num(product.stock) <= num(product.minStock)).map(product => ({ ...product, suggested: Math.max(num(product.minStock), num(product.minStock) * 2 - num(product.stock)) }));
  const html = `<div class="card" style="margin-bottom:16px"><div class="section-title"><div><h2>Sugerencia de reposición</h2><p>Calculada con stock mínimo y objetivo de dos veces el mínimo.</p></div><button class="btn btn-secondary" id="exportReorderCsv">Exportar CSV</button></div>${suggested.length ? `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Sugerido comprar</th><th>Proveedor</th></tr></thead><tbody>${suggested.map(product => `<tr><td><b>${esc(product.code)}</b></td><td>${esc(product.name)}</td><td>${num(product.stock)}</td><td>${num(product.minStock)}</td><td><b>${product.suggested}</b></td><td>${esc(supplierById(product.supplierId)?.businessName || 'Sin asignar')}</td></tr>`).join('')}</tbody></table></div>` : emptyState('No hay productos por reponer.')}</div>`;
  document.getElementById('view').insertAdjacentHTML('afterbegin', html);
  document.getElementById('exportReorderCsv').addEventListener('click', () => {
    const rows = [['Código','Producto','Stock','Mínimo','Cantidad sugerida','Proveedor'], ...suggested.map(product => [product.code, product.name, product.stock, product.minStock, product.suggested, supplierById(product.supplierId)?.businessName || ''])];
    downloadText(rows.map(row => row.map(csvEscape).join(',')).join('\n'), `sugerencia_compra_${todayKey()}.csv`, 'text/csv;charset=utf-8');
  });
};

var renderSettingsC12 = renderSettings;
renderSettings = function renderSettingsC13() {
  renderSettingsC12();
  document.getElementById('resetDemo')?.remove();
  [...document.querySelectorAll('#view .summary-row')].forEach(row => { if (row.querySelector('span')?.textContent.trim() === 'Versión') row.remove(); });
  const connectionCards = document.querySelectorAll('#view .card');
  const lastCard = connectionCards[connectionCards.length - 1];
  if (lastCard) lastCard.innerHTML = `<div class="section-title"><div><h2>Estado del sistema</h2><p>Conexión y sincronización de la operación.</p></div></div>
    <div class="summary-row"><span>Proyecto</span><b>${esc(EXPECTED_FIREBASE_PROJECT)}</b></div><div class="summary-row"><span>Usuario conectado</span><b>${esc(Cloud.user?.email || '—')}</b></div><div class="summary-row"><span>Estado</span><b>${Cloud.online ? 'Conectado' : 'Sin conexión'}</b></div>
    <div class="actions" style="margin-top:14px"><button class="btn btn-primary" id="forceCloudSync">Sincronizar ahora</button><button class="btn btn-info" id="testFirebaseConnection">Verificar conexión</button><button class="btn btn-warning" id="migrateC12">Importar datos anteriores</button></div>`;
  const maintenanceCard = document.querySelector('#view .grid > .card');
  if (maintenanceCard) maintenanceCard.insertAdjacentHTML('beforeend', `<div class="section-title" style="margin-top:22px"><div><h2>Importación masiva CSV</h2><p>Actualiza registros existentes por NIT o código.</p></div></div><div class="actions"><label class="btn btn-secondary" for="importClientsCsv">Importar clientes</label><input class="hidden" id="importClientsCsv" type="file" accept=".csv,text/csv"><label class="btn btn-secondary" for="importProductsCsv">Importar productos</label><input class="hidden" id="importProductsCsv" type="file" accept=".csv,text/csv"><button class="btn btn-outline" id="downloadCsvTemplates">Descargar plantillas</button></div>`);
  document.getElementById('forceCloudSync')?.addEventListener('click', async () => { try { await Cloud.syncNow(DB, { force: true }); toast('Sincronización completada.', 'ok'); } catch (error) { toast(firebaseErrorMessage(error), 'danger'); } });
  document.getElementById('testFirebaseConnection')?.addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = 'Probando…';
    try { const result = await Cloud.testConnection(); toast(`Firebase verificado: ${result.projectId} · ${result.role}.`, 'ok'); }
    catch (error) { console.error(error); toast(firebaseErrorMessage(error), 'danger'); }
    finally { button.disabled = false; button.textContent = 'Probar conexión completa'; }
  });
  document.getElementById('migrateC12')?.addEventListener('click', migrateC12ToFirebase);
  document.getElementById('importClientsCsv')?.addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importClientsCsv(file); });
  document.getElementById('importProductsCsv')?.addEventListener('change', event => { const file = event.target.files?.[0]; if (file) importProductsCsv(file); });
  document.getElementById('downloadCsvTemplates')?.addEventListener('click', () => {
    downloadText('negocio,tipo,contacto,nit,telefono,whatsapp,ciudad,zona,direccion,lista_precio,condicion_pago,dias_credito,cupo_credito,estado,notas\n', 'plantilla_clientes.csv', 'text/csv;charset=utf-8');
    setTimeout(() => downloadText('codigo,codigo_barras,producto,marca,categoria,segmento,viscosidad,presentacion,unidad,unidades_caja,ubicacion,stock,stock_minimo,costo,precio_general,precio_mayorista,precio_distribuidor,estado\n', 'plantilla_productos.csv', 'text/csv;charset=utf-8'), 300);
  });
};


async function receivePurchase(purchaseId) {
  const purchase = DB.purchases.find(item => item.id === purchaseId);
  if (!purchase || purchase.status === 'Recibida') return;
  if (!confirm(`¿Recibir ${purchase.number} y aumentar existencias?`)) return;
  try {
    const result = await Cloud.receivePurchaseAtomic(purchase);
    result.productStocks.forEach(item => {
      const product = productById(item.productId);
      if (product) { product.stock = item.stock; product.cost = item.cost; product.updatedAt = nowIso(); }
    });
    DB.inventoryMovements.unshift(...result.movements);
    purchase.status = 'Recibida';
    purchase.receivedAt = nowIso();
    purchase.receivedBy = currentUserEmail();
    audit('RECIBIR', 'Compra', purchase.id, purchase.number);
    saveDB();
    renderPurchases();
    toast('Compra recibida e inventario actualizado.', 'ok');
  } catch (error) {
    console.error(error);
    toast(firebaseErrorMessage(error), 'danger');
  }
}



function clientFrequentProducts(clientId, limit = 6) {
  const totals = new Map();
  DB.orders.filter(order => order.clientId === clientId && !['Cancelado','Borrador','Convertido'].includes(order.status)).forEach(order => {
    (order.items || []).forEach(item => totals.set(item.productId, num(totals.get(item.productId)) + num(item.quantity)));
  });
  return [...totals.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit).map(([productId]) => productById(productId)).filter(product => product && product.status === 'Activo');
}

var clientOrderSummaryC13Base = clientOrderSummary;
clientOrderSummary = function clientOrderSummaryC13(client) {
  const base = clientOrderSummaryC13Base(client);
  const frequent = clientFrequentProducts(client?.id);
  if (!frequent.length) return base;
  return `${base}<div class="frequent-products"><span class="tiny muted"><b>Productos frecuentes:</b></span><div class="actions">${frequent.map(product => `<button class="btn btn-outline btn-sm" type="button" data-frequent-product="${product.id}">${esc(product.code)} · ${esc(product.name)}</button>`).join('')}</div></div>`;
};

var renderOrderCartC13Base = renderOrderCart;
renderOrderCart = function renderOrderCartC13() {
  if (!ui.orderCart.length) return emptyState('Agrega productos al pedido.');
  return ui.orderCart.map(item => {
    const perCase = Math.max(1, num(item.unitsPerCase));
    const cases = perCase > 1 ? Math.floor(num(item.quantity) / perCase) : 0;
    const loose = perCase > 1 ? num(item.quantity) % perCase : num(item.quantity);
    const equivalent = perCase > 1 ? `${cases ? `${cases} caja${cases === 1 ? '' : 's'}` : ''}${cases && loose ? ' + ' : ''}${loose ? `${loose} und.` : ''}` : `${num(item.quantity)} und.`;
    return `<div class="cart-item"><div class="cart-item-head"><div><div class="cart-item-title">${esc(item.name)}</div><div class="cart-meta">${esc(item.code)} · ${esc(item.presentation)} · Stock ${item.stock}</div><div class="tiny muted">Equivalencia: ${esc(equivalent)}${perCase > 1 ? ` · Caja x ${perCase}` : ''}</div></div><button class="btn btn-danger btn-sm" data-remove-cart="${item.productId}">Quitar</button></div><div class="cart-item-foot"><div class="qty-control"><button data-qty="-1" data-product="${item.productId}">−</button><input class="input" type="number" min="1" max="${item.stock}" value="${item.quantity}" data-qty-input="${item.productId}"><button data-qty="1" data-product="${item.productId}">＋</button></div><b>${money(item.price * item.quantity)}</b></div></div>`;
  }).join('');
};

var renderOrderNewC13Base = renderOrderNew;
renderOrderNew = function renderOrderNewC13() {
  renderOrderNewC13Base();
  const picker = document.querySelector('.product-picker');
  const productSelect = document.getElementById('orderProduct');
  if (!picker || !productSelect) return;
  picker.classList.add('enhanced-product-picker');
  productSelect.closest('.field').insertAdjacentHTML('beforebegin', `<div class="field product-search-field"><label>Buscar producto o escanear código</label><input class="input" id="orderProductSearch" placeholder="Código, barras, marca, viscosidad o nombre" autocomplete="off"></div>`);
  document.getElementById('orderQuantity').closest('.field').insertAdjacentHTML('beforebegin', `<div class="field"><label>Presentación de pedido</label><select class="select" id="orderQuantityMode"><option value="unit">Unidades</option><option value="case">Cajas completas</option></select></div>`);
  const search = document.getElementById('orderProductSearch');
  const allProducts = DB.products.filter(product => product.status === 'Activo').sort((a,b) => a.name.localeCompare(b.name));
  const refreshOptions = () => {
    const query = search.value.trim().toLowerCase();
    const client = clientById(ui.selectedClientId);
    const filtered = !query ? allProducts : allProducts.filter(product => [product.code, product.barcode, product.name, product.brand, product.viscosity, product.category, product.segment].some(value => String(value || '').toLowerCase().includes(query)));
    productSelect.innerHTML = filtered.map(product => `<option value="${product.id}">${esc(product.code)} · ${esc(product.name)} · ${money(product.prices?.[client?.priceList] ?? product.prices?.general)} · Stock ${num(product.stock)}</option>`).join('');
    if (!filtered.length) productSelect.innerHTML = '<option value="">Sin resultados</option>';
  };
  search.addEventListener('input', refreshOptions);
  search.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const exact = allProducts.find(product => [product.code, product.barcode].some(value => String(value || '').toLowerCase() === search.value.trim().toLowerCase()));
    if (exact) productSelect.value = exact.id;
    addOrderProduct();
    search.select();
  });
  document.querySelectorAll('[data-frequent-product]').forEach(button => button.addEventListener('click', () => {
    productSelect.value = button.dataset.frequentProduct;
    document.getElementById('orderQuantity').focus();
  }));
};

function bindOrderEvents() {
  document.getElementById('orderClient').addEventListener('change', event => {
    const nextClient = clientById(event.target.value);
    ui.selectedClientId = event.target.value;
    ui.orderCart.forEach(item => {
      const product = productById(item.productId);
      item.price = num(product?.prices?.[nextClient?.priceList] ?? product?.prices?.general ?? item.price);
    });
    renderOrderNew();
    if (ui.orderCart.length) toast('Se conservaron los productos y se actualizaron los precios del cliente.', 'ok');
  });
  document.getElementById('quickClientButton').addEventListener('click', () => openClientForm(true));
  document.getElementById('addOrderProduct').addEventListener('click', addOrderProduct);
  document.getElementById('orderDeliveryCost').addEventListener('input', () => document.getElementById('orderTotals').innerHTML = renderOrderTotals());
  document.getElementById('orderDelivery').addEventListener('change', event => {
    const hidden = event.target.value === 'Recoge en bodega';
    document.getElementById('deliveryCostField').classList.toggle('hidden', hidden);
    if (hidden) document.getElementById('orderDeliveryCost').value = '0';
    document.getElementById('orderTotals').innerHTML = renderOrderTotals();
  });
  document.getElementById('clearCart').addEventListener('click', () => { ui.orderCart = []; refreshCart(); });
  document.getElementById('confirmOrder').addEventListener('click', confirmOrder);
  document.getElementById('saveDraft').addEventListener('click', saveOrderDraft);
  document.getElementById('saveQuote').addEventListener('click', saveQuoteFromCurrent);
  bindCartEvents();
}

function addOrderProduct() {
  const product = productById(document.getElementById('orderProduct').value);
  const client = clientById(ui.selectedClientId);
  const requested = Math.floor(num(document.getElementById('orderQuantity').value));
  const mode = document.getElementById('orderQuantityMode')?.value || 'unit';
  if (!product || requested < 1) return toast('Selecciona producto y cantidad válida.', 'warn');
  const perCase = Math.max(1, Math.floor(num(product.unitsPerCase) || 1));
  if (mode === 'case' && perCase <= 1) return toast('Este producto no tiene unidades por caja configuradas.', 'warn');
  const quantity = mode === 'case' ? requested * perCase : requested;
  const existing = ui.orderCart.find(item => item.productId === product.id);
  const totalQty = quantity + num(existing?.quantity);
  if (totalQty > num(product.stock)) return toast(`Solo hay ${product.stock} unidades disponibles${perCase > 1 ? ` (${Math.floor(num(product.stock) / perCase)} cajas completas)` : ''}.`, 'danger');
  const price = num(product.prices?.[client?.priceList] ?? product.prices?.general);
  if (existing) {
    existing.quantity = totalQty;
    existing.unitsPerCase = perCase;
  } else {
    ui.orderCart.push({ productId: product.id, code: product.code, name: product.name, presentation: product.presentation, quantity, price, stock: num(product.stock), unitsPerCase: perCase, costSnapshot: num(product.cost) });
  }
  document.getElementById('orderQuantity').value = '1';
  refreshCart();
}


function openStockAdjust(productId) {
  const product = productById(productId);
  if (!product) return;
  openModal(`<div class="modal-head"><div><h2>Ajustar inventario</h2><p class="muted">${esc(product.code)} · ${esc(product.name)}</p></div><button class="modal-close" data-close-modal>×</button></div>
    <form id="stockForm"><div class="notice">Existencia actual: <b>${num(product.stock)} unidades</b>. Cada ajuste queda registrado en el kardex.</div><div class="form-grid" style="margin-top:14px">
      <div class="field"><label>Tipo</label><select class="select" name="type"><option>Entrada de mercancía</option><option>Salida manual</option><option>Ajuste de conteo</option><option>Producto averiado</option><option>Uso interno</option></select></div>
      <div class="field"><label>Nueva existencia</label><input class="input" type="number" min="0" name="newStock" value="${num(product.stock)}" required></div>
      <div class="field full"><label>Motivo *</label><textarea class="textarea" name="reason" required></textarea></div>
    </div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar ajuste</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);
  bindCloseModal();
  document.getElementById('stockForm').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Actualizando…';
    try {
      const result = await Cloud.adjustStockAtomic(productId, data.newStock, data.type, data.reason);
      product.stock = result.stock;
      product.updatedAt = nowIso();
      DB.inventoryMovements.unshift(result.movement);
      audit('AJUSTAR', 'Inventario', product.id, data.reason);
      saveDB();
      closeModal();
      renderProducts();
      toast('Inventario actualizado con trazabilidad.', 'ok');
    } catch (error) {
      console.error(error);
      toast(firebaseErrorMessage(error), 'danger');
      button.disabled = false;
      button.textContent = 'Guardar ajuste';
    }
  });
}

function openOrderStatusModal(orderId) {
  const order = orderById(orderId);
  if (!order) return;
  openModal(`<div class="modal-head"><div><h2>Actualizar despacho</h2><p class="muted">${esc(order.number)} · ${esc(order.clientName)}</p></div><button class="modal-close" data-close-modal>×</button></div>
    <form id="statusForm"><div class="form-grid">
      <div class="field"><label>Estado</label><select class="select" name="status">${['Pendiente de aprobación','Confirmado','En preparación','Listo para despacho','En ruta','Entrega parcial','Entregado'].map(value => `<option ${order.status === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
      <div class="field"><label>Responsable de ruta</label><select class="select" name="assignedTo"><option value="">Sin asignar</option>${DB.users.filter(user => user.status === 'Activo' && ['Ruta','Bodega','Administrador'].includes(user.role)).map(user => `<option value="${user.id}" ${order.assignedTo === user.id ? 'selected' : ''}>${esc(user.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Fecha de despacho</label><input class="input" type="date" name="dispatchDate" value="${esc(order.dispatchDate || todayKey())}"></div>
      <div class="field"><label>Recibido por</label><input class="input" name="receivedBy" value="${esc(order.receivedBy || '')}" placeholder="Nombre de quien recibe"></div>
      <div class="field full"><label>Evidencia de entrega</label><input class="input" type="file" name="deliveryEvidence" accept="image/*" capture="environment"><span class="help">Opcional. Foto de remisión, sello o mercancía entregada; máximo 20 MB. La imagen se divide en fragmentos y se guarda en Firestore.</span></div>
      <div class="field full"><label>Nota logística</label><textarea class="textarea" name="dispatchNotes">${esc(order.dispatchNotes || '')}</textarea></div>
    </div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Actualizar despacho</button>${order.deliveryEvidence?.fileId ? `<button class="btn btn-outline" type="button" id="viewDeliveryEvidence">Ver evidencia</button>` : ''}<button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);
  bindCloseModal();
  document.getElementById('viewDeliveryEvidence')?.addEventListener('click', () => viewDeliveryEvidence(order.id));
  document.getElementById('statusForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const file = form.elements.deliveryEvidence.files?.[0];
    const beforeState = { products: deepClone(DB.products), counters: deepClone(DB.counters), auditLogs: deepClone(DB.auditLogs) };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = file ? 'Subiendo evidencia…' : 'Actualizando…';
    try {
      let evidence = order.deliveryEvidence || null;
      if (file) evidence = await Cloud.uploadDeliveryEvidence(file, order);
      Object.assign(order, {
        status: data.status, assignedTo: data.assignedTo, dispatchDate: data.dispatchDate,
        receivedBy: data.receivedBy, dispatchNotes: data.dispatchNotes, deliveryEvidence: evidence,
        deliveredAt: data.status === 'Entregado' ? (order.deliveredAt || nowIso()) : '',
        deliveredBy: data.status === 'Entregado' ? currentUserEmail() : '', updatedAt: nowIso()
      });
      audit('ACTUALIZAR', 'Pedido', order.id, `Estado ${order.status}`);
      saveDB();
      closeModal();
      renderRoute();
      toast('Estado de despacho actualizado.', 'ok');
    } catch (error) {
      console.error(error);
      toast(firebaseErrorMessage(error), 'danger');
      button.disabled = false;
      button.textContent = 'Actualizar despacho';
    }
  });
}

function openReturnForm() {
  const orders = DB.orders.filter(order => !['Cancelado','Borrador','Convertido'].includes(order.status) && (order.items || []).length);
  if (!orders.length) return toast('No hay pedidos disponibles para devolución.', 'warn');
  openModal(`<div class="modal-head"><div><h2>Registrar devolución</h2><p class="muted">La devolución actualizará cartera e inventario mediante una transacción segura.</p></div><button class="modal-close" data-close-modal>×</button></div>
    <form id="returnForm"><div class="form-grid">
      <div class="field full"><label>Pedido</label><select class="select" id="returnOrder" name="orderId">${orders.map(order => `<option value="${order.id}">${order.number} · ${esc(order.clientName)}</option>`).join('')}</select></div>
      <div class="field full"><label>Producto</label><select class="select" id="returnProduct" name="productId"></select></div>
      <div class="field"><label>Cantidad</label><input class="input" type="number" min="1" name="quantity" value="1" required></div>
      <div class="field"><label>Resolución</label><select class="select" name="resolution"><option>Nota a favor</option><option>Cambio de producto</option><option>Reembolso</option><option>Garantía en revisión</option></select></div>
      <div class="field"><label>Reintegrar al inventario</label><select class="select" name="restock"><option value="si">Sí, producto en buen estado</option><option value="no">No, producto averiado</option></select></div>
      <div class="field full"><label>Motivo *</label><textarea class="textarea" name="reason" required></textarea></div>
    </div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Registrar devolución</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);
  bindCloseModal();
  const fillProducts = () => {
    const order = orderById(document.getElementById('returnOrder').value);
    document.getElementById('returnProduct').innerHTML = (order.items || []).map(item => {
      const returned = num(order.returnedQuantities?.[item.productId]) || DB.returns.filter(record => record.orderId === order.id && record.productId === item.productId && record.status !== 'Anulada').reduce((sum, record) => sum + num(record.quantity), 0);
      const available = Math.max(0, num(item.quantity) - returned);
      return `<option value="${item.productId}" ${available <= 0 ? 'disabled' : ''}>${esc(item.name)} · Disponible para devolver ${available}</option>`;
    }).join('');
  };
  fillProducts();
  document.getElementById('returnOrder').addEventListener('change', fillProducts);
  document.getElementById('returnForm').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const order = orderById(data.orderId);
    const item = (order?.items || []).find(row => row.productId === data.productId);
    const quantity = Math.floor(num(data.quantity));
    if (!order || !item || quantity < 1) return toast('Selecciona un producto y una cantidad válida.', 'danger');
    const returned = num(order.returnedQuantities?.[item.productId]) || DB.returns.filter(record => record.orderId === order.id && record.productId === item.productId && record.status !== 'Anulada').reduce((sum, record) => sum + num(record.quantity), 0);
    if (returned + quantity > num(item.quantity)) return toast('La cantidad supera lo vendido o ya devuelto.', 'danger');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Registrando…';
    const draft = {
      id: id('ret'), orderId: order.id, orderNumber: order.number, clientId: order.clientId,
      clientName: order.clientName, productId: item.productId, productCode: item.code,
      productName: item.name, quantity, unitPrice: num(item.price), creditAmount: quantity * num(item.price),
      resolution: data.resolution, restock: data.restock === 'si', reason: data.reason
    };
    try {
      const result = await Cloud.registerReturnAtomic(draft);
      DB.returns.unshift(result.returnRecord);
      DB.counters.returns = result.returnCounter;
      if (result.movement) DB.inventoryMovements.unshift(result.movement);
      if (result.productStock) {
        const product = productById(result.productStock.productId);
        if (product) product.stock = result.productStock.stock;
      }
      order.returnedQuantities = result.returnedQuantities;
      order.totalReturns = result.totalReturns;
      order.balance = result.newBalance;
      order.paymentStatus = result.paymentStatus;
      order.pdf = { ...(order.pdf || {}), generated: false, version: result.nextPdfVersion, fileName: `FACTURA_COMPRA_${order.number}-V${result.nextPdfVersion}.pdf`, layoutVersion: 2, storage: 'firestore-base64' };
      order.updatedAt = nowIso();
      recalcClientBalance(order.clientId);
      audit('CREAR', 'Devolución', result.returnRecord.id, result.returnRecord.number);
      saveDB();
      closeModal();
      renderReturns();
      toast(`Devolución ${result.returnRecord.number} registrada.`, 'ok');
    } catch (error) {
      console.error(error);
      toast(firebaseErrorMessage(error), 'danger');
      button.disabled = false;
      button.textContent = 'Registrar devolución';
    }
  });
}

boot();


// ===== Catálogo visual e imágenes de producto · C1.8 =====
const CATALOG_CART_SESSION_KEY = 'mar_catalog_cart_c1_8';

function loadCatalogCartC17() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CATALOG_CART_SESSION_KEY) || '[]');
    if (Array.isArray(saved)) ui.catalogCart = saved.filter(item => productById(item.productId));
  } catch (_) { ui.catalogCart = []; }
}

function persistCatalogCartC17() {
  try { sessionStorage.setItem(CATALOG_CART_SESSION_KEY, JSON.stringify(ui.catalogCart || [])); } catch (_) {}
}

function productThumbUrl(product) {
  const fileId = product?.image?.fileId;
  if (product?.imageThumb && fileId) {
    ProductImageCache.setThumb(fileId, product.imageThumb);
    return product.imageThumb;
  }
  return ProductImageCache.getThumb(fileId) || 'assets/product-placeholder.svg';
}

function productImageMarkup(product, className = 'product-image') {
  const hasImage = Boolean(product?.image?.fileId);
  return `<button class="product-image-button ${hasImage ? '' : 'no-image'}" type="button" ${hasImage ? `data-view-product-image="${product.id}"` : 'disabled'} title="${hasImage ? 'Ver imagen completa' : 'Producto sin imagen'}"><img class="${className}" src="${esc(productThumbUrl(product))}" alt="${esc(product?.name || 'Producto')}" loading="lazy"></button>`;
}

async function viewProductImage(productId) {
  const product = productById(productId);
  if (!product?.image?.fileId) return toast('Este producto todavía no tiene imagen.', 'warn');
  openModal(`<div class="modal-head"><div><h2>${esc(product.name)}</h2><p class="muted">Cargando imagen desde la caché o Firestore…</p></div><button class="modal-close" data-close-modal>×</button></div><div class="image-view-loading">Cargando imagen…</div>`);
  bindCloseModal();
  try {
    const result = await FirestoreFiles.read(product.image.fileId);
    const url = URL.createObjectURL(result.blob);
    document.getElementById('modalCard').innerHTML = `<div class="modal-head"><div><h2>${esc(product.name)}</h2><p class="muted">${esc(product.code)} · ${esc(product.brand || 'Sin marca')}</p></div><button class="modal-close" data-close-modal>×</button></div><div class="product-full-image-wrap"><img class="product-full-image" src="${url}" alt="${esc(product.name)}"></div><div class="actions" style="margin-top:14px"><a class="btn btn-primary" href="${url}" download="${esc(product.image.fileName || `${product.code}.jpg`)}">Descargar imagen</a><button class="btn btn-secondary" type="button" data-close-modal>Cerrar</button></div>`;
    bindCloseModal();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (error) {
    console.error(error);
    document.querySelector('.image-view-loading').innerHTML = `<div class="notice danger">${esc(firebaseErrorMessage(error))}</div>`;
  }
}

function bindProductImageViewButtons() {
  document.querySelectorAll('[data-view-product-image]').forEach(button => button.addEventListener('click', () => viewProductImage(button.dataset.viewProductImage)));
}

function renderCatalogCartC17() {
  if (!ui.catalogCart?.length) return emptyState('Agrega productos desde el catálogo.');
  return ui.catalogCart.map(item => {
    const product = productById(item.productId);
    return `<div class="catalog-cart-item"><div class="catalog-cart-thumb">${product ? productImageMarkup(product, 'catalog-cart-image') : ''}</div><div class="catalog-cart-info"><b>${esc(item.name)}</b><span>${esc(item.code)} · ${money(item.price)}</span><div class="qty-control"><button data-catalog-qty="-1" data-product="${item.productId}">−</button><input class="input" type="number" min="1" max="${item.stock}" value="${item.quantity}" data-catalog-qty-input="${item.productId}"><button data-catalog-qty="1" data-product="${item.productId}">＋</button></div></div><div class="catalog-cart-total"><b>${money(item.price * item.quantity)}</b><button class="btn btn-danger btn-sm" data-catalog-remove="${item.productId}">Quitar</button></div></div>`;
  }).join('');
}

function catalogCartTotalC17() {
  return (ui.catalogCart || []).reduce((sum, item) => sum + num(item.price) * num(item.quantity), 0);
}

function refreshCatalogCartC17() {
  const list = document.getElementById('catalogCartList');
  if (!list) return;
  list.innerHTML = renderCatalogCartC17();
  document.getElementById('catalogCartCount').textContent = `${(ui.catalogCart || []).length} producto(s)`;
  document.getElementById('catalogCartTotal').textContent = money(catalogCartTotalC17());
  document.getElementById('catalogMakeOrder').disabled = !(ui.catalogCart || []).length;
  persistCatalogCartC17();
  bindCatalogCartEventsC17();
  bindProductImageViewButtons();
}

function addCatalogProductC17(productId, quantity = 1) {
  const product = productById(productId);
  quantity = Math.max(1, Math.floor(num(quantity)));
  if (!product || product.status !== 'Activo') return toast('El producto no está disponible.', 'warn');
  if (num(product.stock) <= 0) return toast('Este producto está agotado.', 'warn');
  const existing = ui.catalogCart.find(item => item.productId === productId);
  const total = quantity + num(existing?.quantity);
  if (total > num(product.stock)) return toast(`Solo hay ${product.stock} unidades disponibles.`, 'danger');
  const price = num(product.prices?.[ui.catalogPriceList] ?? product.prices?.general);
  if (existing) { existing.quantity = total; existing.price = price; existing.stock = num(product.stock); }
  else ui.catalogCart.push({ productId, code: product.code, name: product.name, presentation: product.presentation, quantity, price, stock: num(product.stock), unitsPerCase: Math.max(1, num(product.unitsPerCase)), costSnapshot: num(product.cost) });
  refreshCatalogCartC17();
  toast(`${product.name} agregado al pedido.`, 'ok');
}

function changeCatalogQtyC17(productId, value) {
  const item = ui.catalogCart.find(row => row.productId === productId);
  if (!item) return;
  const quantity = Math.floor(num(value));
  if (quantity <= 0) ui.catalogCart = ui.catalogCart.filter(row => row.productId !== productId);
  else if (quantity <= num(item.stock)) item.quantity = quantity;
  else return toast(`Máximo disponible: ${item.stock}.`, 'warn');
  refreshCatalogCartC17();
}

function bindCatalogCartEventsC17() {
  document.querySelectorAll('[data-catalog-remove]').forEach(button => button.addEventListener('click', () => { ui.catalogCart = ui.catalogCart.filter(item => item.productId !== button.dataset.catalogRemove); refreshCatalogCartC17(); }));
  document.querySelectorAll('[data-catalog-qty]').forEach(button => button.addEventListener('click', () => {
    const item = ui.catalogCart.find(row => row.productId === button.dataset.product);
    if (item) changeCatalogQtyC17(item.productId, num(item.quantity) + num(button.dataset.catalogQty));
  }));
  document.querySelectorAll('[data-catalog-qty-input]').forEach(input => input.addEventListener('change', () => changeCatalogQtyC17(input.dataset.catalogQtyInput, input.value)));
}

function renderCatalog() {
  const search = String(ui.catalogSearch || '').trim().toLowerCase();
  const active = DB.products.filter(product => product.status === 'Activo');
  const categories = [...new Set(active.map(product => product.category).filter(Boolean))].sort();
  const segments = [...new Set(active.map(product => product.segment).filter(Boolean))].sort();
  const filtered = active.filter(product => {
    const matchesSearch = !search || [product.code, product.barcode, product.name, product.brand, product.category, product.segment, product.viscosity, product.presentation].some(value => String(value || '').toLowerCase().includes(search));
    const matchesCategory = !ui.catalogCategory || product.category === ui.catalogCategory;
    const matchesSegment = !ui.catalogSegment || product.segment === ui.catalogSegment;
    return matchesSearch && matchesCategory && matchesSegment;
  }).sort((a,b) => a.name.localeCompare(b.name));
  const cards = filtered.map(product => {
    const price = num(product.prices?.[ui.catalogPriceList] ?? product.prices?.general);
    return `<article class="catalog-product-card ${num(product.stock) <= 0 ? 'out-of-stock' : ''}">${productImageMarkup(product, 'catalog-product-image')}<div class="catalog-product-body"><div class="catalog-product-code">${esc(product.code)}</div><h3>${esc(product.name)}</h3><p>${esc(product.brand || 'Sin marca')} · ${esc(product.presentation || '')}</p><div class="catalog-tags"><span>${esc(product.category || 'Producto')}</span><span>${esc(product.segment || 'Universal')}</span>${product.viscosity ? `<span>${esc(product.viscosity)}</span>` : ''}</div><div class="catalog-price-row"><div><span>Precio</span><b>${money(price)}</b></div><div><span>Stock</span><b>${num(product.stock)}</b></div></div><div class="catalog-add-row"><input class="input" type="number" min="1" max="${num(product.stock)}" value="1" data-catalog-product-qty="${product.id}" ${num(product.stock)<=0?'disabled':''}><button class="btn btn-primary btn-sm" data-catalog-add="${product.id}" ${num(product.stock)<=0?'disabled':''}>${num(product.stock)<=0?'Agotado':'＋ Agregar'}</button></div></div></article>`;
  }).join('');
  document.getElementById('view').innerHTML = `<div class="catalog-layout"><section><div class="card catalog-toolbar-card"><div class="section-title"><div><h2>Catálogo visual</h2><p>Busca, muestra productos al cliente y arma el pedido sin repetir información.</p></div><span class="pill">${filtered.length} producto(s)</span></div><div class="catalog-filters"><div class="field"><label>Buscar</label><input class="input" id="catalogSearch" value="${esc(ui.catalogSearch)}" placeholder="Código, nombre, marca, viscosidad o barras"></div><div class="field"><label>Categoría</label><select class="select" id="catalogCategory"><option value="">Todas</option>${categories.map(value => `<option value="${esc(value)}" ${ui.catalogCategory===value?'selected':''}>${esc(value)}</option>`).join('')}</select></div><div class="field"><label>Segmento</label><select class="select" id="catalogSegment"><option value="">Todos</option>${segments.map(value => `<option value="${esc(value)}" ${ui.catalogSegment===value?'selected':''}>${esc(value)}</option>`).join('')}</select></div><div class="field"><label>Precio de referencia</label><select class="select" id="catalogPriceList"><option value="general" ${ui.catalogPriceList==='general'?'selected':''}>General</option><option value="mayorista" ${ui.catalogPriceList==='mayorista'?'selected':''}>Mayorista</option><option value="distribuidor" ${ui.catalogPriceList==='distribuidor'?'selected':''}>Distribuidor</option></select></div></div></div>${filtered.length ? `<div class="catalog-grid">${cards}</div>` : emptyState('No hay productos que coincidan con los filtros.')}</section><aside class="card sticky catalog-order-panel"><div class="section-title"><div><h2>Pedido en preparación</h2><p id="catalogCartCount">${ui.catalogCart.length} producto(s)</p></div><button class="btn btn-danger btn-sm" id="catalogClear">Limpiar</button></div><div id="catalogCartList" class="catalog-cart-list">${renderCatalogCartC17()}</div><div class="summary-box" style="margin-top:14px"><div class="summary-row total"><span>Total de referencia</span><span id="catalogCartTotal">${money(catalogCartTotalC17())}</span></div><div class="tiny muted" style="margin-top:8px">Los precios se ajustarán automáticamente cuando selecciones el cliente.</div></div><button class="btn btn-primary catalog-make-order" id="catalogMakeOrder" ${ui.catalogCart.length?'':'disabled'}>Hacer pedido</button></aside></div>`;
  document.getElementById('catalogSearch').addEventListener('input', event => { ui.catalogSearch = event.target.value; renderCatalog(); });
  document.getElementById('catalogCategory').addEventListener('change', event => { ui.catalogCategory = event.target.value; renderCatalog(); });
  document.getElementById('catalogSegment').addEventListener('change', event => { ui.catalogSegment = event.target.value; renderCatalog(); });
  document.getElementById('catalogPriceList').addEventListener('change', event => {
    ui.catalogPriceList = event.target.value;
    ui.catalogCart.forEach(item => { const product = productById(item.productId); item.price = num(product?.prices?.[ui.catalogPriceList] ?? product?.prices?.general); });
    renderCatalog();
  });
  document.querySelectorAll('[data-catalog-add]').forEach(button => button.addEventListener('click', () => {
    const input = document.querySelector(`[data-catalog-product-qty="${button.dataset.catalogAdd}"]`);
    addCatalogProductC17(button.dataset.catalogAdd, input?.value || 1);
  }));
  document.getElementById('catalogClear').addEventListener('click', () => { ui.catalogCart = []; refreshCatalogCartC17(); });
  document.getElementById('catalogMakeOrder').addEventListener('click', () => {
    if (!ui.catalogCart.length) return;
    const client = clientById(ui.selectedClientId) || DB.clients.find(item => item.status === 'Activo') || DB.clients[0];
    const merged = new Map((ui.orderCart || []).map(item => [item.productId, { ...item }]));
    ui.catalogCart.forEach(item => {
      const product = productById(item.productId);
      if (!product) return;
      const current = merged.get(item.productId);
      const quantity = Math.min(num(product.stock), num(item.quantity) + num(current?.quantity));
      merged.set(item.productId, { ...item, quantity, stock: num(product.stock), price: num(product.prices?.[client?.priceList] ?? product.prices?.general) });
    });
    ui.orderCart = [...merged.values()].filter(item => item.quantity > 0);
    ui.catalogCart = [];
    persistCatalogCartC17();
    navigate('orderNew');
    toast('Productos transferidos. Completa cliente, pago y fecha de entrega.', 'ok');
  });
  bindCatalogCartEventsC17();
  bindProductImageViewButtons();
}

var renderRouteC17Base = renderRoute;
renderRoute = function renderRouteC17() {
  if (ui.route === 'catalog') return renderCatalog();
  return renderRouteC17Base();
};

var renderDashboardC17Base = renderDashboard;
renderDashboard = function renderDashboardC17() {
  renderDashboardC17Base();
  const actions = document.querySelector('.card:last-child .actions');
  if (actions && can('catalog')) {
    actions.insertAdjacentHTML('afterbegin', '<button class="btn btn-primary" data-go="catalog">🖼️ Abrir catálogo</button>');
    actions.querySelector('[data-go="catalog"]')?.addEventListener('click', () => navigate('catalog'));
  }
};

var renderOrderCartC17Base = renderOrderCart;
renderOrderCart = function renderOrderCartC17() {
  if (!ui.orderCart.length) return emptyState('Agrega productos al pedido.');
  return ui.orderCart.map(item => {
    const product = productById(item.productId);
    const perCase = Math.max(1, num(item.unitsPerCase));
    const cases = perCase > 1 ? Math.floor(num(item.quantity) / perCase) : 0;
    const loose = perCase > 1 ? num(item.quantity) % perCase : num(item.quantity);
    const equivalent = perCase > 1 ? `${cases ? `${cases} caja${cases === 1 ? '' : 's'}` : ''}${cases && loose ? ' + ' : ''}${loose ? `${loose} und.` : ''}` : `${num(item.quantity)} und.`;
    return `<div class="cart-item visual-cart-item">${product ? `<div class="order-cart-thumb">${productImageMarkup(product, 'order-cart-image')}</div>` : ''}<div class="order-cart-main"><div class="cart-item-head"><div><div class="cart-item-title">${esc(item.name)}</div><div class="cart-meta">${esc(item.code)} · ${esc(item.presentation)} · Stock ${item.stock}</div><div class="tiny muted">Equivalencia: ${esc(equivalent)}${perCase > 1 ? ` · Caja x ${perCase}` : ''}</div></div><button class="btn btn-danger btn-sm" data-remove-cart="${item.productId}">Quitar</button></div><div class="cart-item-foot"><div class="qty-control"><button data-qty="-1" data-product="${item.productId}">−</button><input class="input" type="number" min="1" max="${item.stock}" value="${item.quantity}" data-qty-input="${item.productId}"><button data-qty="1" data-product="${item.productId}">＋</button></div><b>${money(item.price * item.quantity)}</b></div></div></div>`;
  }).join('');
};

var bindCartEventsC17Base = bindCartEvents;
bindCartEvents = function bindCartEventsC17() {
  bindCartEventsC17Base();
  bindProductImageViewButtons();
};

function renderOrderVisualGridC17(query = '') {
  const grid = document.getElementById('orderVisualGrid');
  if (!grid) return;
  const text = String(query || '').trim().toLowerCase();
  const products = DB.products.filter(product => product.status === 'Activo' && (!text || [product.code, product.barcode, product.name, product.brand, product.viscosity, product.category].some(value => String(value || '').toLowerCase().includes(text)))).slice(0, 12);
  grid.innerHTML = products.length ? products.map(product => `<div class="order-visual-card">${productImageMarkup(product, 'order-visual-image')}<div><b>${esc(product.name)}</b><span>${esc(product.code)} · Stock ${num(product.stock)}</span><button class="btn btn-outline btn-sm" type="button" data-order-visual-add="${product.id}" ${num(product.stock)<=0?'disabled':''}>${num(product.stock)<=0?'Agotado':'Seleccionar'}</button></div></div>`).join('') : emptyState('No hay productos para mostrar.');
  document.querySelectorAll('[data-order-visual-add]').forEach(button => button.addEventListener('click', () => {
    const select = document.getElementById('orderProduct');
    if (select) select.value = button.dataset.orderVisualAdd;
    document.getElementById('orderQuantity')?.focus();
  }));
  bindProductImageViewButtons();
}

var renderOrderNewC17Base = renderOrderNew;
renderOrderNew = function renderOrderNewC17() {
  renderOrderNewC17Base();
  const picker = document.querySelector('.enhanced-product-picker') || document.querySelector('.product-picker');
  if (picker) picker.insertAdjacentHTML('afterend', `<div class="order-visual-panel"><div class="section-title"><div><h3>Apoyo visual</h3><p>Selecciona el producto por imagen y luego define la cantidad.</p></div><button class="btn btn-outline btn-sm" type="button" data-go="catalog">Ver catálogo completo</button></div><div id="orderVisualGrid" class="order-visual-grid"></div></div>`);
  const search = document.getElementById('orderProductSearch');
  renderOrderVisualGridC17(search?.value || '');
  search?.addEventListener('input', () => renderOrderVisualGridC17(search.value));
  document.querySelector('[data-go="catalog"]')?.addEventListener('click', () => navigate('catalog'));
  bindProductImageViewButtons();
};

function renderProducts() {
  const filter = ui.productFilter.toLowerCase();
  const all = DB.products.filter(product => !filter || [product.code, product.barcode, product.name, product.brand, product.category, product.viscosity].some(value => String(value || '').toLowerCase().includes(filter))).sort((a,b) => a.name.localeCompare(b.name));
  const page = paginate(all, ui.productPage);
  ui.productPage = page.page;
  const value = DB.products.reduce((sum, product) => sum + num(product.stock) * num(product.cost), 0);
  document.getElementById('view').innerHTML = `<div class="grid grid-3">${statCard('Productos', DB.products.length, '🛢️')}${statCard('Valor inventario', money(value), '💰')}${statCard('Stock crítico', DB.products.filter(product => num(product.stock) <= num(product.minStock)).length, '⚠️')}</div><div class="card" style="margin-top:16px"><div class="section-title"><div><h2>Productos e inventario</h2><p>Incluye fotografía comercial, precios, ubicación, proveedor y existencias.</p></div><div class="actions"><button class="btn btn-outline" data-go="catalog">🖼️ Ver catálogo</button><button class="btn btn-primary" id="newProduct">＋ Registrar producto</button></div></div><div class="toolbar"><input class="input search" id="productSearch" placeholder="Buscar código, barras, producto, marca o viscosidad" value="${esc(ui.productFilter)}"><span class="pill">${all.length} productos</span></div>${page.items.length ? `<div class="table-wrap"><table><thead><tr><th>Imagen</th><th>Producto</th><th>Clasificación</th><th>Existencias</th><th>Proveedor</th><th class="money">Costo</th><th class="money">Precios</th><th>Acciones</th></tr></thead><tbody>${page.items.map(product => `<tr><td class="product-table-image-cell">${productImageMarkup(product, 'product-table-image')}</td><td><b>${esc(product.name)}</b><div class="tiny muted">${esc(product.code)} · ${esc(product.brand || 'Sin marca')} · ${esc(product.presentation || '')}</div><div class="tiny muted">Barras: ${esc(product.barcode || '—')} · Ubicación ${esc(product.location || '—')}</div></td><td>${esc(product.category)}<div class="tiny muted">${esc(product.segment || '')} ${product.viscosity ? `· ${esc(product.viscosity)}` : ''}</div></td><td><b>${num(product.stock)} ${esc(product.unit || 'und.')}</b><div class="tiny muted">Mínimo ${num(product.minStock)} ${num(product.stock)<=num(product.minStock)?'· Reponer':''}</div></td><td>${esc(supplierById(product.supplierId)?.businessName || '—')}</td><td class="money">${money(product.cost)}</td><td class="money"><b>${money(product.prices?.distribuidor)}</b><div class="tiny muted">May. ${money(product.prices?.mayorista)} · Gen. ${money(product.prices?.general)}</div></td><td><div class="actions"><button class="btn btn-secondary btn-sm" data-product-edit="${product.id}">Editar</button>${product.image?.fileId ? `<button class="btn btn-info btn-sm" data-view-product-image="${product.id}">Imagen</button>` : ''}<button class="btn btn-warning btn-sm" data-product-stock="${product.id}">Ajustar</button></div></td></tr>`).join('')}</tbody></table></div>${paginationHtml(page, 'products')}` : emptyState('No se encontraron productos.')}</div>`;
  document.getElementById('newProduct').addEventListener('click', () => openProductForm());
  document.getElementById('productSearch').addEventListener('input', event => { ui.productFilter = event.target.value; ui.productPage = 1; renderProducts(); });
  bindPagination('products', page);
  bindGoButtons();
  document.querySelectorAll('[data-product-edit]').forEach(button => button.addEventListener('click', () => openProductForm(button.dataset.productEdit)));
  document.querySelectorAll('[data-product-stock]').forEach(button => button.addEventListener('click', () => openStockAdjust(button.dataset.productStock)));
  bindProductImageViewButtons();
}

function openProductForm(productId = '') {
  const existing = productById(productId);
  const product = existing || { code:'', barcode:'', name:'', brand:'', category:'Aceites para carro', segment:'Carros', viscosity:'', presentation:'1 litro', unit:'Unidad', unitsPerCase:1, location:'', supplierId:'', stock:0, minStock:0, cost:0, prices:{general:0,mayorista:0,distribuidor:0}, status:'Activo', image:null, imageThumb:'' };
  openModal(`<div class="modal-head"><div><h2>${productId ? 'Editar producto' : 'Registrar producto'}</h2><p class="muted">Información comercial, fotografía e inventario para carros y motos.</p></div><button class="modal-close" data-close-modal>×</button></div><form id="productForm"><div class="product-image-form"><div class="product-image-preview-wrap"><img id="productImagePreview" class="product-image-preview" src="${esc(productThumbUrl(product))}" alt="Vista previa"><span>La miniatura se guarda localmente para reutilizarla sin nuevas consultas.</span></div><div class="field"><label>Imagen del producto</label><input class="input" id="productImageFile" type="file" name="productImage" accept="image/*"><span class="help">JPG, PNG, WEBP u otra imagen de hasta 20 MB. El archivo completo se fragmenta en Firestore; el catálogo usa una miniatura optimizada.</span>${product.image?.fileId ? '<label class="check-line"><input type="checkbox" name="removeImage" value="yes"> Eliminar imagen actual</label>' : ''}</div></div><div class="form-grid-3"><div class="field"><label>Código *</label><input class="input" name="code" value="${esc(product.code)}" required></div><div class="field"><label>Código de barras</label><input class="input" name="barcode" value="${esc(product.barcode)}"></div><div class="field"><label>Producto *</label><input class="input" name="name" value="${esc(product.name)}" required></div><div class="field"><label>Marca</label><input class="input" name="brand" value="${esc(product.brand)}"></div><div class="field"><label>Categoría</label><select class="select" name="category">${['Aceites para carro','Aceites para moto','Refrigerantes','Aditivos','Filtros','Baterías','Bujías','Repuestos','Otros'].map(value => `<option ${product.category===value?'selected':''}>${value}</option>`).join('')}</select></div><div class="field"><label>Segmento</label><select class="select" name="segment">${['Carros','Motos','Carros y motos','Pesados','Universal'].map(value => `<option ${product.segment===value?'selected':''}>${value}</option>`).join('')}</select></div><div class="field"><label>Viscosidad/referencia</label><input class="input" name="viscosity" value="${esc(product.viscosity)}"></div><div class="field"><label>Presentación</label><input class="input" name="presentation" value="${esc(product.presentation)}"></div><div class="field"><label>Unidad</label><select class="select" name="unit">${['Unidad','Caja','Galón','Litro','Juego','Par'].map(value => `<option ${product.unit===value?'selected':''}>${value}</option>`).join('')}</select></div><div class="field"><label>Unidades por caja</label><input class="input" type="number" min="1" name="unitsPerCase" value="${num(product.unitsPerCase)||1}"></div><div class="field"><label>Ubicación</label><input class="input" name="location" value="${esc(product.location)}"></div><div class="field"><label>Proveedor principal</label><select class="select" name="supplierId"><option value="">Sin asignar</option>${DB.suppliers.map(supplier => `<option value="${supplier.id}" ${product.supplierId===supplier.id?'selected':''}>${esc(supplier.businessName)}</option>`).join('')}</select></div><div class="field"><label>Stock actual</label><input class="input" type="number" min="0" name="stock" value="${num(product.stock)}" ${productId?'readonly':''}><span class="help">${productId?'Usa Ajustar para conservar trazabilidad.':'Existencia inicial.'}</span></div><div class="field"><label>Stock mínimo</label><input class="input" type="number" min="0" name="minStock" value="${num(product.minStock)}"></div><div class="field"><label>Costo</label><input class="input" type="number" min="0" name="cost" value="${num(product.cost)}"></div><div class="field"><label>Precio general</label><input class="input" type="number" min="0" name="general" value="${num(product.prices?.general)}"></div><div class="field"><label>Precio mayorista</label><input class="input" type="number" min="0" name="mayorista" value="${num(product.prices?.mayorista)}"></div><div class="field"><label>Precio distribuidor</label><input class="input" type="number" min="0" name="distribuidor" value="${num(product.prices?.distribuidor)}"></div><div class="field"><label>Estado</label><select class="select" name="status"><option ${product.status==='Activo'?'selected':''}>Activo</option><option ${product.status==='Inactivo'?'selected':''}>Inactivo</option></select></div></div><div class="actions" style="margin-top:16px"><button class="btn btn-primary" type="submit">Guardar producto</button><button class="btn btn-secondary" type="button" data-close-modal>Cancelar</button></div></form>`);
  bindCloseModal();
  const fileInput = document.getElementById('productImageFile');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) { fileInput.value = ''; return toast('Selecciona un archivo de imagen.', 'warn'); }
    if (file.size > FIRESTORE_FILE_MAX_BYTES) { fileInput.value = ''; return toast('La imagen no puede superar 20 MB.', 'danger'); }
    const url = URL.createObjectURL(file);
    document.getElementById('productImagePreview').src = url;
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  document.getElementById('productForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const file = fileInput.files?.[0];
    const removeImage = data.removeImage === 'yes';
    const targetId = productId || id('pro');
    const oldImage = product.image ? { ...product.image } : null;
    let uploadedImage = null;
    let thumb = product.imageThumb || ProductImageCache.getThumb(product.image?.fileId) || '';
    const beforeState = { products: deepClone(DB.products), counters: deepClone(DB.counters), auditLogs: deepClone(DB.auditLogs) };
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = file ? 'Subiendo imagen…' : 'Guardando…';
    try {
      if (file) {
        if (!navigator.onLine) throw new Error('Para subir una imagen nueva necesitas conexión a internet.');
        thumb = await ProductImageCache.createThumbnail(file);
        uploadedImage = await FirestoreFiles.save(file, { fileName: `${String(data.code || 'producto').replace(/[^a-z0-9_-]+/gi,'-')}-${Date.now()}.${String(file.name.split('.').pop() || 'jpg').toLowerCase()}`, category: 'producto-imagen', entityType: 'producto', entityId: targetId, entityNumber: data.code, allowedMimePrefixes: ['image/'] });
        ProductImageCache.setThumb(uploadedImage.fileId, thumb);
        await ProductImageCache.setBlob(uploadedImage.fileId, file, { id: uploadedImage.fileId, fileName: uploadedImage.fileName, mimeType: uploadedImage.mimeType, originalSize: uploadedImage.size, completed: true, status: 'complete' });
      }
      const next = { ...data, unitsPerCase:num(data.unitsPerCase), stock:num(data.stock), minStock:num(data.minStock), cost:num(data.cost), prices:{general:num(data.general),mayorista:num(data.mayorista),distribuidor:num(data.distribuidor)}, image: file ? uploadedImage : removeImage ? null : product.image || null, imageThumb: file ? thumb : removeImage ? '' : product.imageThumb || thumb, updatedAt:nowIso() };
      delete next.general; delete next.mayorista; delete next.distribuidor; delete next.productImage; delete next.removeImage;
      if (productId) { next.stock = num(product.stock); Object.assign(product, next); audit('ACTUALIZAR','Producto',product.id,product.code); }
      else { next.id = targetId; next.createdAt = nowIso(); DB.products.push(next); DB.counters.products = num(DB.counters.products) + 1; audit('CREAR','Producto',next.id,next.code); }
      saveDB({ skipCloud: true });
      await Cloud.syncNow(DB);
      toast('Producto e imagen guardados.', 'ok');
      closeModal();
      renderProducts();
      if ((file || removeImage) && oldImage?.fileId && oldImage.fileId !== uploadedImage?.fileId) FirestoreFiles.remove(oldImage.fileId).catch(error => console.warn('No se pudo retirar la imagen anterior:', error));
    } catch (error) {
      console.error(error);
      DB.products = beforeState.products;
      DB.counters = beforeState.counters;
      DB.auditLogs = beforeState.auditLogs;
      try { saveDB({ skipCloud: true }); } catch (_) {}
      if (uploadedImage?.fileId) FirestoreFiles.remove(uploadedImage.fileId).catch(() => {});
      toast(firebaseErrorMessage(error), 'danger');
      button.disabled = false;
      button.textContent = 'Guardar producto';
    }
  });
}

loadCatalogCartC17();
