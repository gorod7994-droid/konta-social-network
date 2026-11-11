// KONTA 7 — appearance, layout and account preferences.
'use strict';
(function(){
const escapeHtml = val=>String(val??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults={theme:'light',density:'regular',enter_to_send:true,feed_default:'all',language:'uk'};
let pending=false;
function safePrefs(record){
 const p={...defaults};
 if(record&&typeof record==='object'&&!Array.isArray(record)){
  if(['light','dark','system'].includes(record.theme))p.theme=record.theme;
  if(['regular','compact'].includes(record.density))p.density=record.density;
  if(typeof record.enter_to_send==='boolean')p.enter_to_send=record.enter_to_send;
  if(['all','friends','groups','mine','liked'].includes(record.feed_default))p.feed_default=record.feed_default;
  if(['uk','en','ru','zh','fr'].includes(record.language))p.language=record.language;
 }
 return p;
}
function applyPreferences(row){
 const p=safePrefs(row);
 state.preferences=p;
 const theme=p.theme==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p.theme;
 document.documentElement.dataset.theme=theme;
 document.documentElement.dataset.density=p.density;
 document.documentElement.lang=p.language;
 document.documentElement.dataset.language=p.language;
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
 '<section class="panel classic-settings"><h2 class="classic-section-title">Мова інтерфейсу</h2>'+field('Мова','Обери мову меню та основних кнопок','<select id="classicLanguage" class="settings-select" aria-label="Мова інтерфейсу">'+[['uk','🇺🇦 Українська'],['en','🇬🇧 English'],['ru','Русский'],['zh','🇨🇳 中文'],['fr','🇫🇷 Français']].map(([v,l])=>'<option value="'+v+'" '+(p.language===v?'selected':'')+'>'+l+'</option>').join('')+'</select>')+'</section>'+ 
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
 const allowed={theme:['light','dark','system'],density:['regular','compact'],feed_default:['all','friends','groups','mine','liked'],language:['uk','en','ru','zh','fr']};
 if(field!=='enter_to_send'&&!allowed[field]?.includes(value))return;
 if(field==='enter_to_send'&&typeof value!=='boolean')return;
 const old=getPrefs(),next={...old,[field]:value};
 applyPreferences(next);
 if(field==='feed_default')state.feedFilter=next.feed_default;
 if(field==='language')translateUI();
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
  if(field==='language'){render();translateUI()}
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
  const lang=document.querySelector('#classicLanguage');if(lang)lang.value=old.language;
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

// Translate fixed interface labels only; never translate user messages or post bodies.
const labels={
 'Новини':['News','Новости','动态','Actualités'],
 'Друзі':['Friends','Друзья','好友','Amis'],
 'Події':['Events','События','活动','Événements'],
 'Допис':['Post','Запись','发布','Publier'],
 'Чати':['Chats','Чаты','聊天','Messages'],
 'Я':['Me','Я','我','Moi'],
 'Налаштування':['Settings','Настройки','设置','Paramètres'],
 'Мої налаштування':['My settings','Мои настройки','我的设置','Mes paramètres'],
 'Налаштуй KONTA під себе':['Personalize KONTA','Настрой KONTA под себя','个性化 KONTA','Personnalisez KONTA'],
 'Зовнішній вигляд':['Appearance','Внешний вид','外观','Apparence'],
 'Тема оформлення':['Theme','Тема оформления','主题','Thème'],
 'Світла, темна або як у системі':['Light, dark or system','Светлая, тёмная или системная','浅色、深色或跟随系统','Clair, sombre ou système'],
 '☀ Світла':['☀ Light','☀ Светлая','☀ 浅色','☀ Clair'],
 '☾ Темна':['☾ Dark','☾ Тёмная','☾ 深色','☾ Sombre'],
 '◐ Системна':['◐ System','◐ Системная','◐ 系统','◐ Système'],
 'Щільність інтерфейсу':['Layout density','Плотность интерфейса','界面密度','Densité'],
 'Звичайна':['Regular','Обычная','标准','Normale'],
 'Компактна':['Compact','Компактная','紧凑','Compact'],
 'Мова інтерфейсу':['Interface language','Язык интерфейса','界面语言','Langue de l’interface'],
 'Мова':['Language','Язык','语言','Langue'],
 'Обери мову меню та основних кнопок':['Choose a language for menus and buttons','Выбери язык меню и кнопок','选择菜单和按钮语言','Choisissez la langue des menus'],
 'Новини та повідомлення':['Feed and messages','Новости и сообщения','动态和消息','Fil et messages'],
 'Відкривати стрічку':['Default feed','Лента по умолчанию','默认动态','Fil par défaut'],
 'Усі новини':['All posts','Все новости','所有动态','Toutes les publications'],
 'Спільноти':['Communities','Сообщества','社区','Communautés'],
 'Мої дописи':['My posts','Мои записи','我的帖子','Mes publications'],
 'Мені подобається':['Liked','Понравилось','喜欢','J’aime'],
 'Enter надсилає повідомлення':['Enter sends messages','Enter отправляет сообщения','Enter 发送消息','Entrée envoie les messages'],
 'Увімкнено':['On','Включено','开启','Activé'],
 'Вимкнено':['Off','Выключено','关闭','Désactivé'],
 'Акаунт та безпека':['Account and security','Аккаунт и безопасность','账户与安全','Compte et sécurité'],
 'Ім’я, фото та інформація':['Name, photo and info','Имя, фото и информация','姓名、照片和资料','Nom, photo et infos'],
 'Змінити профіль':['Edit profile','Изменить профиль','编辑个人资料','Modifier le profil'],
 'Пароль':['Password','Пароль','密码','Mot de passe'],
 'Змінити пароль':['Change password','Сменить пароль','修改密码','Changer le mot de passe'],
 'Завершення сеансу':['Sign out','Завершить сеанс','退出登录','Déconnexion'],
 'Вийти':['Sign out','Выйти','退出','Déconnexion'],
 'Надіслати':['Send','Отправить','发送','Envoyer'],
 'Поділитися':['Share','Поделиться','分享','Partager'],
 'Коментарі':['Comments','Комментарии','评论','Commentaires'],
 'Пошук':['Search','Поиск','搜索','Rechercher'],
 'Підписатися':['Follow','Подписаться','关注','Suivre'],
 'Моя історія':['My story','Моя история','我的动态','Ma story'],
 'Створити допис':['Create post','Создать запись','创建帖子','Créer une publication']
};
function translateUI(){
 const lang=getPrefs().language;if(lang==='uk')return;
 const index={en:0,ru:1,zh:2,fr:3}[lang];if(index===undefined)return;
 const roots=[document.querySelector('#main'),document.querySelector('.bottom-nav'),document.querySelector('.sidebar'),document.querySelector('.topbar')].filter(Boolean);
 for(const root of roots){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){const el=node.parentElement;if(!el||el.closest('.post-text,.comment-text,.message-text,.chat-message,.user-bio,.profile-bio,textarea,option,[contenteditable],.konta-story:not(.add)'))continue;
 const value=node.nodeValue.trim();if(labels[value])node.nodeValue=node.nodeValue.replace(value,labels[value][index]);}
 }
}

function init(){
 document.addEventListener('change',ev=>{
  if(ev.target.id==='classicLanguage')setPref('language',ev.target.value);
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