// KONTA 7 — appearance, layout and account preferences.
'use strict';
(function(){
const escapeHtml = val=>String(val??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults={theme:'light',density:'regular',enter_to_send:true,feed_default:'all'};
let pending=false;
function safePrefs(record){
 const p={...defaults};
 if(record&&typeof record==='object'&&!Array.isArray(record)){
  if(['light','dark','system'].includes(record.theme))p.theme=record.theme;
  if(['regular','compact'].includes(record.density))p.density=record.density;
  if(typeof record.enter_to_send==='boolean')p.enter_to_send=record.enter_to_send;
  if(['all','friends','groups','mine','liked'].includes(record.feed_default))p.feed_default=record.feed_default;
 }
 return p;
}
function applyPreferences(row){
 const p=safePrefs(row);
 state.preferences=p;
 const theme=p.theme==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p.theme;
 document.documentElement.dataset.theme=theme;
 document.documentElement.dataset.density=p.density;
 try{localStorage.setItem('konta_theme',p.theme);localStorage.setItem('konta_density',p.density);}catch(_){}
 return p;
}
function getPrefs(){return safePrefs(state.preferences)}
const field=(label,details,content)=>'<div class="settings-row"><div class="settings-row-desc"><b>'+label+'</b><small>'+details+'</small></div><div class="settings-control">'+content+'</div></div>';
const option=(name,key,value,label,active)=>'<button type="button" data-action="classic-option" data-field="'+key+'" data-id="'+value+'" class="settings-choice '+(active?'is-selected':'')+'" aria-pressed="'+active+'">'+label+'</button>';
function renderSettings(){
 const p=getPrefs();
 return '<div class="classic-page"><div class="classic-page-heading"><h1>Мої налаштування</h1><span>Налаштуй KONTA під себе</span></div>'+
 '<section class="panel classic-settings"><h2 class="classic-section-title">Зовнішній вигляд</h2>'+
 field('Тема оформлення','Світла, темна або як у системі','<div class="settings-options">'+
 option('theme','theme','light','☀ Світла',p.theme==='light')+
 option('theme','theme','dark','☾ Темна',p.theme==='dark')+
 option('theme','theme','system','◐ Системна',p.theme==='system')+'</div>')+
 field('Щільність інтерфейсу','Компактні відступи як у старому ВК','<div class="settings-options">'+
 option('density','density','regular','Звичайна',p.density==='regular')+
 option('density','density','compact','Компактна',p.density==='compact')+'</div>')+
 '</section>'+
 '<section class="panel classic-settings"><h2 class="classic-section-title">Новини та повідомлення</h2>'+
 field('Відкривати стрічку','Який розділ новин показувати після входу','<select id="classicFeedDefault" class="settings-select" aria-label="Початкова стрічка">'+
 [['all','Усі новини'],['friends','Друзі'],['groups','Спільноти'],['mine','Мої дописи'],['liked','Мені подобається']].map(([v,l])=>'<option value="'+v+'" '+(p.feed_default===v?'selected':'')+'>'+l+'</option>').join('')+'</select>')+
 field('Enter надсилає повідомлення','Shift+Enter завжди додає новий рядок','<label class="classic-switch"><input id="classicEnterToSend" type="checkbox" '+(p.enter_to_send?'checked':'')+'><span class="switch-track"></span><span>'+(p.enter_to_send?'Увімкнено':'Вимкнено')+'</span></label>')+'</section>'+
 '<section class="panel classic-settings"><h2 class="classic-section-title">Акаунт та безпека</h2>'+
 field('Ім’я, фото та інформація','Редагуй свою сторінку KONTA','<button class="btn soft small" data-action="profile-edit">Змінити профіль</button>')+
 field('Пароль','Зміна пароля поточного акаунта','<button class="btn soft small" data-action="classic-change-password">Змінити пароль</button>')+
 field('Завершення сеансу','Вийти з KONTA на цьому пристрої','<button class="btn secondary small" data-action="classic-sign-out">Вийти</button>')+
 '</section><p class="settings-footer">Налаштування зберігаються в твоєму акаунті й застосовуються після наступного входу. KONTA — окремий проєкт у класичному стилі соціальних мереж.</p></div>';
}
async function setPref(field,value){
 if(pending)return;
 const allowed={theme:['light','dark','system'],density:['regular','compact'],feed_default:['all','friends','groups','mine','liked']};
 if(field!=='enter_to_send'&&!allowed[field]?.includes(value))return;
 if(field==='enter_to_send'&&typeof value!=='boolean')return;
 const old=getPrefs(),next={...old,[field]:value};
 applyPreferences(next);
 if(field==='feed_default')state.feedFilter=next.feed_default;
 // Theme and density are driven by CSS variables. Don't remount the settings page.
 function syncControls(){
  document.querySelectorAll('.settings-choice[data-field="'+field+'"]').forEach(button=>{
   const selected=button.dataset.id===next[field];
   button.classList.toggle('is-selected',selected);
   button.setAttribute('aria-pressed',String(selected));
  });
  const send=document.querySelector('#classicEnterToSend');
  if(send){
   send.checked=next.enter_to_send;
   const label=send.parentElement?.querySelector('span:last-child');
   if(label)label.textContent=next.enter_to_send?'Увімкнено':'Вимкнено';
  }
 }
 syncControls();
 pending=true;
 try{
  const {error}=await db.from('user_preferences').upsert({user_id:me(),...next,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(error)throw error;
  toast('Налаштування збережено');
 }catch(error){
  applyPreferences(old);
  state.feedFilter=old.feed_default;
  document.querySelectorAll('.settings-choice[data-field="'+field+'"]').forEach(button=>{
   const selected=button.dataset.id===old[field];
   button.classList.toggle('is-selected',selected);
   button.setAttribute('aria-pressed',String(selected));
  });
  const send=document.querySelector('#classicEnterToSend');
  if(send){send.checked=old.enter_to_send;const label=send.parentElement?.querySelector('span:last-child');if(label)label.textContent=old.enter_to_send?'Увімкнено':'Вимкнено';}
  const feed=document.querySelector('#classicFeedDefault');if(feed)feed.value=old.feed_default;
  toast('Не вдалося зберегти: '+errText(error));
 }finally{pending=false}
}
function action(name,id,node){
 if(name==='classic-option'){
  const field=node?.dataset.field;
  return setPref(field,id);
 }
 if(name==='classic-change-password'){
  const dlg=document.querySelector('#resetDialog');if(!dlg)return;
  dlg.querySelector('h2').textContent='Змінити пароль';
  const msg=dlg.querySelector('p');if(msg)msg.textContent='Встанови новий пароль для свого акаунта KONTA.';
  document.querySelector('#resetPassword').value='';
  dlg.showModal();return;
 }
 if(name==='classic-sign-out'){document.querySelector('#logoutBtn')?.click();return;}
}
function init(){
 document.addEventListener('change',ev=>{
  if(ev.target.id==='classicFeedDefault')setPref('feed_default',ev.target.value);
  if(ev.target.id==='classicEnterToSend')setPref('enter_to_send',ev.target.checked);
 });
 if(window.matchMedia){
  const mq=window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change',()=>{if(getPrefs().theme==='system')applyPreferences(getPrefs());});
 }
}
window.KONTA_CLASSIC={renderSettings,applyPreferences,action,safePrefs};
init();
})();