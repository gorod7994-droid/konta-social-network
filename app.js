'use strict';
// KONTA. Browser app backed by Supabase Auth, PostgreSQL and Storage.
const $ = (selector,scope=document) => scope.querySelector(selector);
const $$ = (selector,scope=document) => Array.from(scope.querySelectorAll(selector));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageSrc = url => typeof url==='string' && /^https:\/\//i.test(url) ? esc(url) : '';
const idOK = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
const fmtTime = value => {const d=new Date(value); if(Number.isNaN(d.valueOf()))return '';const diff=(Date.now()-d.getTime())/60000;if(diff>=0&&diff<1)return 'щойно';if(diff>=0&&diff<60)return `${Math.floor(diff)} хв тому`;if(diff>=0&&diff<1440)return `${Math.floor(diff/60)} год тому`;return new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(d)};
const state = {user:null,profile:null,profiles:[],posts:[],likes:[],comments:[],commentLikes:[],friends:[],groups:[],members:[],messages:[],notifications:[],albums:[],library:[],mediaScope:'all',mediaAlbumId:null,preferences:null,prefsAppliedForUser:null,chatReplyId:null,chatEditId:null,view:'feed',feedFilter:'all',friendsTab:'all',search:'',profileId:null,chatId:null,groupId:null,postGroupId:null,editing:false};
const expandedComments = new Set();
const messageDrafts = new Map();
const pendingReactions = new Set();
let peopleSearchTimer=null,peopleSearchVersion=0;
state.searchRemoteQuery='';state.searchRemoteMatches=[];state.friendSearch='';
const conf=window.KONTA_CONFIG || {};
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(conf.supabaseUrl||'') && /^(sb_publishable_|eyJ)/.test(conf.supabasePublishableKey||'');
const db = configured && window.supabase?.createClient ? window.supabase.createClient(conf.supabaseUrl,conf.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}) : null;
let authMode='login', loading=false, authBoot=false, liveChannel=null, pollId=null, initialLoadError=null, refreshInFlight=false, refreshScheduled=false, lastToastTimer=null;
const me = () => state.user?.id;
const byId = id => state.profiles.find(p=>p.id===id) || (id===me() ? state.profile : null);
const myName = () => state.profile?.display_name || state.user?.email?.split('@')[0] || 'Ти';
const initials = p => ((p?.display_name||'K').trim().charAt(0)||'K').toUpperCase();
function avatar(p,cls=''){const url=imageSrc(p?.avatar_url);return `<span class="avatar ${cls}">${url?`<img src="${url}" alt="">`:esc(initials(p))}</span>`;}
function feedback(selector,message,isError=false){const el=$(selector);if(el){el.textContent=message;el.classList.toggle('is-error',isError)}}
function toast(text){const node=$('#toast');node.textContent=text;node.classList.add('show');clearTimeout(lastToastTimer);lastToastTimer=setTimeout(()=>node.classList.remove('show'),3200)}
function setBusy(selector,busy){const node=$(selector);if(node)node.disabled=busy}
function errText(error){const msg=error?.message||String(error||'Невідома помилка');if(/Invalid login credentials/i.test(msg))return 'Неправильний email або пароль.';if(/Email not confirmed/i.test(msg))return 'Спочатку підтверди email за посиланням у пошті.';if(/User already registered/i.test(msg))return 'Цей email уже зареєстрований.';if(/Password should be at least/i.test(msg))return 'Пароль занадто короткий.';if(/Failed to fetch|NetworkError|fetch failed/i.test(msg))return 'Немає з’єднання. Перевір інтернет і онови сторінку.';if(/duplicate key|unique constraint/i.test(msg))return 'Це ім’я користувача вже зайняте.';if(/relation .* does not exist|schema cache|Could not find the table/i.test(msg))return 'Потрібно один раз запустити SETUP_SUPABASE.sql у Supabase → SQL Editor.';return msg}
function showAuth(){state.user=null;state.profile=null;state.prefsAppliedForUser=null;state.chatReplyId=null;state.chatEditId=null;$('#app').hidden=true;$('#authScreen').hidden=false;if(liveChannel&&db){db.removeChannel(liveChannel);liveChannel=null}clearInterval(pollId);pollId=null;}
function changeAuthMode(mode){authMode=mode;$$('[data-mode]').forEach(b=>b.classList.toggle('is-active',b.dataset.mode===mode));$('#authNameRow').hidden=mode!=='signup';$('#authName').required=mode==='signup';$('#authPasswordRow').hidden=mode==='reset';$('#authPassword').required=mode!=='reset';$('#forgotBtn').textContent=mode==='reset'?'Повернутися до входу':'Забув пароль?';$('#authHeading').textContent=mode==='signup'?'Створи свою сторінку':mode==='reset'?'Відновити пароль':'З поверненням!';$('#authHint').textContent=mode==='signup'?'Реєстрація безкоштовна.':'Вкажи пошту — надішлемо посилання для відновлення.';if(mode==='login')$('#authHint').textContent='Увійди, щоб побачити новини друзів.';$('#authSubmit').textContent=mode==='signup'?'Зареєструватися':mode==='reset'?'Надіслати лист':'Увійти';$('#authPassword').autocomplete=mode==='signup'?'new-password':'current-password';feedback('#authFeedback','');}
function showApp(changed=null){
 if(!state.user)return;
 $('#authScreen').hidden=true;$('#app').hidden=false;
 $('#topMyName').textContent=myName();
 $('#topAvatar').innerHTML=imageSrc(state.profile?.avatar_url)?`<img src="${imageSrc(state.profile.avatar_url)}" alt="">`:esc(initials(state.profile));
 const mounted=$('#main')?.dataset.renderedView===state.view&&!initialLoadError;
 if(mounted&&Array.isArray(changed)){
  const lightweight=['likes','commentLikes','messages','notifications','preferences'];
  if(changed.every(name=>lightweight.includes(name))){
   if(changed.includes('likes')||changed.includes('commentLikes'))paintAllReactions();
   if(changed.includes('messages'))paintChatWithoutRemount();
   if(changed.includes('notifications')&&state.view==='notifications')$('#main').innerHTML=viewNotifications();
   renderSuggestions();
   return;
  }
  if(changed.every(name=>lightweight.includes(name)||name==='comments')){
   document.querySelectorAll('.post[id^="post-"]').forEach(el=>paintPostComments(el.id.slice(5)));
   paintAllReactions();
   if(changed.includes('messages'))paintChatWithoutRemount();
   renderSuggestions();
   return;
  }
 }
 render();
}
function setupError(){return `<div class="panel"><div class="panel-header"><h2>Потрібно налаштувати базу даних</h2></div><div class="panel-inner"><div class="error-box">${esc(initialLoadError||'Не вдалося завантажити дані Supabase.')}</div><p>Відкрий <b>Supabase → SQL Editor → New query</b>, встав увесь файл <b>SETUP_SUPABASE.sql</b>, натисни <b>Run</b>.</p><p>Потім повернися сюди й онови сторінку.</p><button class="btn primary" data-action="reload">Повторити завантаження</button></div></div>`}
async function loadAll(quiet=false){if(!state.user||refreshInFlight)return;refreshInFlight=true;let changed=null;try{
  const id=me();
  const queries = [
    ['profiles', db.from('profiles').select('*').limit(500)],
    ['posts',db.from('posts').select('*').order('created_at',{ascending:false}).limit(200)],
    ['likes',db.from('likes').select('*').limit(3000)],
    ['comments',db.from('comments').select('*').order('created_at',{ascending:true}).limit(3000)],
    ['commentLikes',db.from('comment_likes').select('*').limit(4000)],
    ['friends',db.from('friendships').select('*').or(`requester_id.eq.${id},addressee_id.eq.${id}`).limit(1000)],
    ['groups',db.from('communities').select('*').order('created_at',{ascending:false}).limit(200)],
    ['members',db.from('community_members').select('*').limit(3000)],
    ['albums',db.from('media_albums').select('*').order('created_at',{ascending:false}).limit(500)],
    ['library',db.from('media_library').select('*').order('created_at',{ascending:false}).limit(1000)],
    ['preferences',db.from('user_preferences').select('*').eq('user_id',id).maybeSingle()],
    ['messages',db.from('private_messages').select('*').or(`sender_id.eq.${id},recipient_id.eq.${id}`).order('created_at',{ascending:true}).limit(1000)],
    ['notifications',db.from('notifications').select('*').eq('target_id',id).order('created_at',{ascending:false}).limit(100)]
  ];
  const results=await Promise.all(queries.map(async ([name,query])=>{const {data,error}=await query;if(error)throw new Error(`${name}: ${errText(error)}`);return [name,name==='preferences'?(data||null):(data||[])]}));
  if(id!==me())return;
  changed=results.filter(([name,data])=>JSON.stringify(state[name])!==JSON.stringify(data)).map(([name])=>name);
  for(const [name,data] of results)state[name]=data;
  if(state.searchRemoteMatches?.length){
   const known=new Set(state.profiles.map(p=>p.id));
   for(const p of state.searchRemoteMatches)if(!known.has(p.id)){state.profiles.push(p);known.add(p.id)}
  }
  if(window.KONTA_CLASSIC){state.preferences=window.KONTA_CLASSIC.applyPreferences(state.preferences);if(state.prefsAppliedForUser!==id){state.feedFilter=state.preferences.feed_default;state.prefsAppliedForUser=id;}}
  state.profile=byId(id);initialLoadError=state.profile?null:'Профіль не знайдено. Запусти SETUP_SUPABASE.sql у SQL Editor.';
  if(!quiet)toast('Дані оновлено');
 }catch(error){initialLoadError=errText(error);if(!quiet)toast(initialLoadError)}finally{refreshInFlight=false;showApp(changed)}}
async function signedIn(user){if(!user)return;if(state.user?.id===user.id&&authBoot)return;state.user=user;authBoot=true;$('#authScreen').hidden=true;$('#app').hidden=false;$('#main').innerHTML='<div class="loading-card">Завантажуємо твою сторінку…</div>';await loadAll(true);subscribeLive();const linkedPost=new URLSearchParams(location.hash.slice(1)).get('post');if(idOK(linkedPost)){const linked=state.posts.find(p=>p.id===linkedPost);if(linked){if(linked.community_id)go('group',{groupId:linked.community_id});else go('feed');setTimeout(()=>$('#post-'+linkedPost)?.scrollIntoView({block:'center'}),150)}}if(!pollId)pollId=setInterval(()=>{if(document.visibilityState==='visible'&&state.user)loadAll(true)},25000);}
function subscribeLive(){if(!db||!state.user)return;if(liveChannel)db.removeChannel(liveChannel);liveChannel=db.channel(`konta-${me()}`)
  .on('postgres_changes',{event:'*',schema:'public',table:'private_messages'},()=>scheduleReload())
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications'},()=>scheduleReload())
  .subscribe();}
function scheduleReload(){if(refreshScheduled)return;refreshScheduled=true;setTimeout(()=>{refreshScheduled=false;loadAll(true)},500)}
async function afterChange(message){await loadAll(true);if(message)toast(message)}
function friendRecord(id){return state.friends.find(f=>(f.requester_id===me()&&f.addressee_id===id)||(f.addressee_id===me()&&f.requester_id===id))}
function friendIds(){return state.friends.filter(f=>f.status==='accepted').map(f=>f.requester_id===me()?f.addressee_id:f.requester_id)}
function friendAction(id){if(id===me())return '';const f=friendRecord(id);if(!f)return `<button class="btn primary small" data-action="friend-add" data-id="${id}">＋ У друзі</button>`;if(f.status==='accepted')return `<button class="btn secondary small" data-action="friend-remove" data-id="${id}">✓ Друзі</button>`;if(f.status==='pending'&&f.requester_id===me())return `<button class="btn secondary small" data-action="friend-remove" data-id="${id}">Очікує</button>`;if(f.status==='pending')return `<span class="request-actions"><button class="btn primary small" data-action="friend-accept" data-id="${id}">Прийняти</button><button class="btn secondary small" data-action="friend-remove" data-id="${id}">Ні</button></span>`;return `<button class="btn primary small" data-action="friend-remove" data-id="${id}">Скасувати</button>`}
function personRow(p,controls=true){return `<div class="person-row">${avatar(p)}<div class="person-text"><strong><a href="#" data-action="profile-open" data-id="${esc(p.id)}">${esc(p.display_name)}</a></strong><small>@${esc(p.username)} ${p.bio?'· '+esc(p.bio.slice(0,38)):''}</small></div>${controls?friendAction(p.id):''}</div>`}

function cleanPeopleQuery(value){return String(value||'').trim().replace(/^@+/,'').replace(/\s+/g,' ').slice(0,65).toLocaleLowerCase('uk-UA')}
function personRank(person,q){
 const username=(person.username||'').toLocaleLowerCase('uk-UA'),name=(person.display_name||'').toLocaleLowerCase('uk-UA');
 return username===q?0:username.startsWith(q)?1:name===q?2:name.startsWith(q)?3:username.includes(q)?4:name.includes(q)?5:6;
}
function matchPeople(q){
 const query=cleanPeopleQuery(q);
 const pool=[...state.profiles,...(state.searchRemoteQuery===query?state.searchRemoteMatches:[])];
 const seen=new Set();
 return pool.filter(p=>{if(!p||!p.id||seen.has(p.id)||p.id===me())return false;seen.add(p.id);return !query||[p.username,p.display_name,p.bio].some(v=>(v||'').toLocaleLowerCase('uk-UA').includes(query))})
 .sort((a,b)=>query?personRank(a,query)-personRank(b,query)||a.display_name.localeCompare(b.display_name,'uk-UA'):a.display_name.localeCompare(b.display_name,'uk-UA'));
}
function repaintPeopleResults(){
 const area=$('#searchResults');
 if(area&&state.view==='explore')area.innerHTML=searchResultsHtml(state.search);
 const friends=$('#friendsSearchResults');
 if(friends&&state.view==='friends'&&state.friendsTab==='people'){
  const matched=matchPeople(state.friendSearch);
  friends.innerHTML=matched.length?matched.slice(0,80).map(p=>personRow(p)).join(''):'<div class="empty">Нікого не знайдено. Спробуй ім’я або @нік.</div>';
 }
 const dropdown=$('#topSearchResults'),input=$('#topSearch');
 if(dropdown&&input){
  const text=cleanPeopleQuery(input.value);
  if(!text||text.length<2){dropdown.hidden=true;dropdown.innerHTML='';return}
  const people=matchPeople(text).slice(0,6);
  dropdown.hidden=false;
  dropdown.innerHTML='<div class="instant-search-heading">Люди в KONTA</div>'+(
   people.length?people.map(p=>'<button type="button" data-action="profile-open" data-id="'+esc(p.id)+'" class="instant-person">'+avatar(p,'sm')+'<span><b>'+esc(p.display_name)+'</b><small>@'+esc(p.username)+'</small></span></button>').join(''):'<div class="instant-no-matches">Поки немає збігів — натисни Enter для повного пошуку</div>'
  )+'<button type="button" class="instant-search-more" data-nav="explore">⌕ Повний пошук</button>';
 }
}
function schedulePeopleSearch(query){
 const q=cleanPeopleQuery(query),version=++peopleSearchVersion;
 clearTimeout(peopleSearchTimer);
 state.searchRemoteQuery='';
 state.searchRemoteMatches=[];
 repaintPeopleResults();
 if(!db||q.length<2)return;
 peopleSearchTimer=setTimeout(async()=>{
  // Use parameterized PostgREST filters, not hand-written .or() SQL strings.
  // Remove wildcard characters so searching by a literal nickname stays predictable.
  const safe=q.replace(/[%\\]/g,'').trim();
  if(safe.length<2)return;
  const terms=[db.from('profiles').select('id,username,display_name,bio,avatar_url,created_at').ilike('username','%'+safe+'%').limit(60),
               db.from('profiles').select('id,username,display_name,bio,avatar_url,created_at').ilike('display_name','%'+safe+'%').limit(60)];
  try{
   const replies=await Promise.all(terms);
   if(version!==peopleSearchVersion||!state.user)return;
   const found=[],seen=new Set();
   for(const result of replies){if(result.error)throw result.error;for(const p of result.data||[]){if(!seen.has(p.id)){seen.add(p.id);found.push(p)}}}
   state.searchRemoteQuery=q;state.searchRemoteMatches=found;
   // Keep fetched profiles addressable when someone opens a result beyond the initial list.
   const cached=new Set(state.profiles.map(p=>p.id));
   for(const p of found)if(!cached.has(p.id)){state.profiles.push(p);cached.add(p.id)}
   repaintPeopleResults();
  }catch(error){if(version===peopleSearchVersion){state.searchRemoteQuery='';state.searchRemoteMatches=[];repaintPeopleResults();console.warn('KONTA people search:',errText(error));}}
 },300);
}

function renderSuggestions(){const candidates=state.profiles.filter(p=>p.id!==me()&&!friendRecord(p.id)).slice(0,4);$('#suggestions').innerHTML=candidates.map(p=>personRow(p)).join('')||'<p class="subtle">Запроси друзів — вони з’являться тут.</p>';const count=state.friends.filter(f=>f.status==='pending'&&f.addressee_id===me()).length;$('#requestsBubble').hidden=!count;$('#requestsBubble').textContent=count;const unread=state.notifications.some(n=>!n.is_read);$('#noticeDot').hidden=!unread}
function header(title,right=''){return `<div class="panel-header"><h2>${esc(title)}</h2>${right}</div>`}
function composer(){return `<div class="panel composer-teaser">${avatar(state.profile)}<button data-action="post-open">Що нового, ${esc(myName().split(' ')[0])}?</button><button class="tiny-action" title="Фото" data-action="post-open">▧</button></div>`}
function tabs(items,current,action){return `<div class="feed-tabs">${items.map(([key,label])=>`<button class="${current===key?'is-active':''}" data-action="${action}" data-id="${esc(key)}">${esc(label)}</button>`).join('')}</div>`}
function renderCommentNode(c,children,depth=0){
 const author=byId(c.user_id)||{display_name:'Користувач',username:'user'};
 const likes=state.commentLikes.filter(l=>l.comment_id===c.id),liked=likes.some(l=>l.user_id===me());
 const replies=children.get(c.id)||[];
 return `<div class="comment-thread ${depth?'is-reply':''}" id="comment-${esc(c.id)}">
 <div class="comment-line">${avatar(author,'sm')}<div class="comment-content">
 <div class="comment-message"><a href="#" data-action="profile-open" data-id="${esc(c.user_id)}">${esc(author.display_name)}</a><span>${esc(c.body)}</span></div>
 <div class="comment-tools"><time>${esc(fmtTime(c.created_at))}</time><button type="button" data-action="comment-reply" data-id="${esc(c.id)}">Відповісти</button>${c.user_id===me()?`<button type="button" data-action="comment-delete" data-id="${esc(c.id)}" title="Видалити коментар">Видалити</button>`:''}<button type="button" class="comment-heart ${liked?'is-liked':''}" aria-label="${liked?'Прибрати лайк з коментаря':'Вподобати коментар'}" aria-pressed="${liked}" data-action="comment-like" data-id="${esc(c.id)}">${liked?'♥':'♡'} <span>${likes.length||''}</span></button></div>
 </div></div>${replies.map(r=>renderCommentNode(r,children,Math.min(depth+1,3))).join('')}</div>`;
}
function postCard(p){
 const author=byId(p.user_id)||{display_name:'Користувач KONTA',username:'user'};
 const group=p.community_id?state.groups.find(g=>g.id===p.community_id):null;
 const postLikes=state.likes.filter(l=>l.post_id===p.id),liked=postLikes.some(l=>l.user_id===me());
 const comments=state.comments.filter(c=>c.post_id===p.id);
 const children=new Map();for(const c of comments){if(c.parent_id&&comments.some(p=>p.id===c.parent_id)){if(!children.has(c.parent_id))children.set(c.parent_id,[]);children.get(c.parent_id).push(c)}}
 const roots=comments.filter(c=>!c.parent_id||!comments.some(p=>p.id===c.parent_id));
 const expanded=expandedComments.has(p.id);const shown=expanded?roots:roots.slice(-3);
 const commentsHtml=shown.map(c=>renderCommentNode(c,children)).join('');
 return `<article class="post" id="post-${esc(p.id)}">
 <div class="post-head">${avatar(author)}<div class="post-identity"><strong data-action="profile-open" data-id="${esc(p.user_id)}">${esc(author.display_name)}</strong><small>@${esc(author.username)} · ${esc(fmtTime(p.created_at))}${group?` · <a href="#" data-action="group-open" data-id="${esc(group.id)}">${esc(group.name)}</a>`:''}</small></div></div>
 ${p.body?`<div class="post-text">${esc(p.body)}</div>`:''}${imageSrc(p.media_url)?`<img class="post-photo" src="${imageSrc(p.media_url)}" alt="Фото допису" loading="lazy">`:''}
 <div class="post-actions"><button data-action="post-like" data-id="${esc(p.id)}" class="${liked?'is-liked':''}"><span>${liked?'♥':'♡'}</span>${postLikes.length}</button><button data-action="comment-focus" data-id="${esc(p.id)}"><span>▢</span>${comments.length} коментарів</button><button data-action="share" data-id="${esc(p.id)}"><span>↗</span>Поділитись</button>${p.user_id===me()?`<button class="post-delete" title="Видалити допис" data-action="post-delete" data-id="${esc(p.id)}">✕</button>`:''}</div>
 <div class="comment-area">${roots.length>3?`<button type="button" class="comment-more" data-action="comment-expand" data-id="${esc(p.id)}">${expanded?'Згорнути коментарі':`Показати всі коментарі (${comments.length})`}</button>`:''}
 ${commentsHtml}<form class="comment-form" data-post-id="${esc(p.id)}"><div class="reply-banner" hidden><span class="reply-caption"></span><button type="button" data-action="comment-reply-cancel" data-id="${esc(p.id)}" aria-label="Скасувати відповідь">×</button></div><div class="comment-form-row">${avatar(state.profile,'sm')}<input name="comment" maxlength="500" required placeholder="Написати коментар..." autocomplete="off"><button type="submit">Надіслати</button></div></form></div></article>`;
}
function empty(title,detail,emoji='♡'){return `<div class="panel"><div class="empty"><span class="empty-emoji">${emoji}</span><strong>${esc(title)}</strong>${esc(detail)}</div></div>`}
function viewFeed(){
 let posts=[...state.posts];
 if(state.feedFilter==='friends')posts=posts.filter(p=>friendIds().includes(p.user_id)&&!p.community_id);
 else if(state.feedFilter==='groups')posts=posts.filter(p=>p.community_id);
 else if(state.feedFilter==='mine')posts=posts.filter(p=>p.user_id===me());
 else if(state.feedFilter==='liked')posts=posts.filter(p=>state.likes.some(l=>l.user_id===me()&&l.post_id===p.id));
 const filters=[['all','Усі новини'],['friends','Друзі'],['groups','Спільноти'],['mine','Мої'],['liked','Сподобалося']];
 return `<section class="feed-hero" aria-label="Вітаємо у KONTA"><div><div class="hero-eyebrow">Твій простір онлайн</div><h1 class="page-title">Привіт, ${esc(myName().split(' ')[0])}! 👋</h1><p class="hero-subtitle">Твої новини, друзі та нові знайомства — усе тут.</p></div><button class="btn primary hero-action" type="button" data-action="post-open">＋ Створити допис</button></section>${composer()}<div class="panel">${tabs(filters,state.feedFilter,'feed-tab')}</div>${posts.length?posts.map(postCard).join(''):empty('У цій стрічці поки порожньо','Додай друзів, підпишись на спільноти чи створи допис.','✎')}`;
}
function viewProfile(){
 const uid=state.profileId||me(),p=byId(uid);
 if(!p)return empty('Користувача не знайдено','Можливо, його сторінку видалено.');
 const own=uid===me();
 const fids=state.friends.filter(f=>f.status==='accepted'&&(f.requester_id===uid||f.addressee_id===uid))
  .map(f=>f.requester_id===uid?f.addressee_id:f.requester_id);
 const friends=fids.map(byId).filter(Boolean);
 const posts=state.posts.filter(x=>x.user_id===uid&&!x.community_id);
 const libraryPhotos=state.library.filter(x=>x.kind==='photo'&&x.owner_id===uid);
 const postPhotos=state.posts.filter(x=>x.user_id===uid&&imageSrc(x.media_url)).map(x=>x.media_url);
 const photoUrls=[...libraryPhotos.map(x=>db.storage.from('konta-library').getPublicUrl(x.storage_path).data.publicUrl),...postPhotos].slice(0,6);
 const actions=own?`<button class="btn primary small" data-action="profile-edit">Редагувати сторінку</button>`:
 `${friendAction(uid)} <button class="btn primary small" data-action="chat-open" data-id="${esc(uid)}">Написати повідомлення</button>`;
 const friendGrid=friends.slice(0,6).map(x=>`<button data-action="profile-open" data-id="${esc(x.id)}" title="${esc(x.display_name)}">${avatar(x,'sm')}<span>${esc(x.display_name.split(' ')[0])}</span></button>`).join('');
 const images=photoUrls.map(src=>`<img src="${imageSrc(src)}" loading="lazy" alt="Фото користувача">`).join('');
 return `<div class="profile-classic">
 <aside class="profile-classic-rail">
  <div class="panel profile-photo-card">${avatar(p,'lg')}${own?'<button class="btn soft small" data-action="profile-edit">Змінити фотографію</button>':`<button class="btn primary small" data-action="chat-open" data-id="${esc(uid)}">Написати</button>`}</div>
  <div class="panel"><h3 class="classic-section-title">Друзі <span>${friends.length}</span></h3><div class="classic-peek"><div class="classic-friend-grid">${friendGrid||'<span class="subtle">Поки немає друзів</span>'}</div></div></div>
  <div class="panel"><h3 class="classic-section-title">Фотографії <span>${photoUrls.length}</span></h3><div class="classic-peek"><div class="classic-mini-photos">${images||'<span class="subtle">Поки немає фото</span>'}</div></div></div>
 </aside>
 <section class="classic-profile-main">
  <div class="panel profile-summary">
   <div class="classic-page-heading"><h1 class="profile-classic-name">${esc(p.display_name)}</h1><span>@${esc(p.username)}</span></div>
   <div class="profile-classic-meta"><span>Про себе:</span><strong class="profile-classic-about">${esc(p.bio||'Тут ще немає інформації')}</strong><span>У KONTA:</span><strong>${esc(fmtTime(p.created_at))}</strong></div>
   <div class="profile-classic-actions">${actions}</div>
   <div class="profile-stats"><button data-nav="friends"><b>${friends.length}</b>друзів</button><button data-nav="photos"><b>${libraryPhotos.length+postPhotos.length}</b>фото</button><button data-nav="groups"><b>${state.members.filter(x=>x.user_id===uid).length}</b>спільнот</button></div>
  </div>
  ${own?composer():''}
  <h3 class="section-heading">Стіна · ${posts.length} записів</h3>
  ${posts.length?posts.map(postCard).join(''):empty('Стіна поки порожня','Тут будуть записи з профілю.')}
 </section>
 </div>`;
}
function viewFriends(){const allFriends=state.friends.filter(f=>f.status==='accepted').map(f=>byId(f.requester_id===me()?f.addressee_id:f.requester_id)).filter(Boolean);const incoming=state.friends.filter(f=>f.status==='pending'&&f.addressee_id===me()).map(f=>byId(f.requester_id)).filter(Boolean);const outgoing=state.friends.filter(f=>f.status==='pending'&&f.requester_id===me()).map(f=>byId(f.addressee_id)).filter(Boolean);let current=state.friendsTab==='requests'?incoming:state.friendsTab==='outgoing'?outgoing:state.friendsTab==='all'?allFriends:matchPeople(state.friendSearch);return `<h1 class="page-title">Друзі</h1><div class="panel">${tabs([['all',`Друзі (${allFriends.length})`],['requests',`Заявки (${incoming.length})`],['outgoing','Надіслані'],['people','Знайти людей']],state.friendsTab,'friends-tab')}${state.friendsTab==='people'?`<div class="people-search-wrap"><input id="friendsSearchInput" class="search-large" placeholder="Шукай за ім’ям або @ніком" autocomplete="off" value="${esc(state.friendSearch)}"></div>`:''}<div class="person-list" id="friendsSearchResults">${current.length?current.slice(0,80).map(p=>personRow(p)).join(''):`<div class="empty">${state.friendsTab==='all'?'Поки немає друзів. Знайди когось через «Знайти людей».':state.friendsTab==='people'?'Нікого не знайдено. Спробуй ім’я або @нік.':'Тут поки що порожньо.'}</div>`}</div></div>`}
function searchResultsHtml(q){
 const query=cleanPeopleQuery(q),people=matchPeople(q).slice(0,80);
 const posts=query?state.posts.filter(p=>(p.body+' '+(byId(p.user_id)?.display_name||'')).toLocaleLowerCase('uk-UA').includes(query)).slice(0,20):[];
 return '<div class="panel">'+header('Люди ('+people.length+')')+'<div class="person-list">'+(people.length?people.map(p=>personRow(p)).join(''):'<div class="empty">За цим іменем або @ніком нікого не знайдено.</div>')+'</div></div>'+(query?'<div class="section-heading">Дописи ('+posts.length+')</div>'+posts.map(postCard).join(''):'');
}
function viewExplore(){return `<h1 class="page-title">Пошук у KONTA</h1><div class="panel"><div class="panel-inner"><input class="search-large" id="exploreInput" placeholder="Ім’я, нікнейм або текст допису" value="${esc(state.search)}"></div></div><div id="searchResults">${searchResultsHtml(state.search)}</div>`}
function viewPhotos(){return window.KONTA_MEDIA?.render('photo')||empty('Фотографії','Бібліотека завантажується.');}
function viewVideos(){return window.KONTA_MEDIA?.render('video')||empty('Відео','Бібліотека завантажується.');}
function viewMusic(){return window.KONTA_MEDIA?.render('audio')||empty('Музика','Бібліотека завантажується.');}
function groupCard(g){const count=state.members.filter(m=>m.community_id===g.id).length;const joined=state.members.some(m=>m.community_id===g.id&&m.user_id===me());return `<div class="group-card"><span class="group-mark">◎</span><div class="group-title"><strong><a href="#" data-action="group-open" data-id="${esc(g.id)}">${esc(g.name)}</a></strong><small>${esc(g.description||'Спільнота KONTA')} · ${count} учасників</small></div><button class="btn small ${joined?'secondary':'primary'}" data-action="group-${joined?'leave':'join'}" data-id="${esc(g.id)}">${joined?'✓ Учасник':'＋ Вступити'}</button></div>`}
function viewGroups(){return `<h1 class="page-title">Спільноти</h1><div class="panel">${header('Спільноти KONTA','<button class="btn primary small" data-action="group-create">＋ Створити</button>')}<div>${state.groups.length?state.groups.map(groupCard).join(''):'<div class="empty">Тут ще немає груп. Створи першу!</div>'}</div></div>`}
function viewGroup(){const g=state.groups.find(x=>x.id===state.groupId);if(!g)return viewGroups();const joined=state.members.some(m=>m.community_id===g.id&&m.user_id===me());const posts=state.posts.filter(p=>p.community_id===g.id);return `<div class="panel"><div class="cover"></div><div class="panel-inner"><h2>${esc(g.name)}</h2><p>${esc(g.description||'Спільнота у KONTA')}</p><p class="subtle">${state.members.filter(m=>m.community_id===g.id).length} учасників</p><button class="btn ${joined?'secondary':'primary'}" data-action="group-${joined?'leave':'join'}" data-id="${esc(g.id)}">${joined?'✓ Ви у спільноті':'＋ Приєднатися'}</button></div></div>${joined?`<div class="panel composer-teaser">${avatar(state.profile)}<button data-action="group-post" data-id="${esc(g.id)}">Напиши щось у спільноту…</button></div>`:''}<h3 class="section-heading">Дописи спільноти</h3>${posts.length?posts.map(postCard).join(''):empty('Поки немає дописів','Стань першим, хто опублікує новину!')}`}
function chatIds(){const ids=[];for(const m of [...state.messages].reverse()){const other=m.sender_id===me()?m.recipient_id:m.sender_id;if(!ids.includes(other))ids.push(other)}if(state.chatId&&!ids.includes(state.chatId))ids.unshift(state.chatId);return ids}
function chatClock(value){const d=new Date(value);return Number.isNaN(d.valueOf())?'':new Intl.DateTimeFormat('uk-UA',{hour:'2-digit',minute:'2-digit'}).format(d)}
function chatDay(value){const d=new Date(value);return Number.isNaN(d.valueOf())?'':new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'long',year:'numeric'}).format(d)}
function viewMessages(){
 const users=chatIds(),mobile=window.innerWidth<=720;
 const selected=state.chatId||(!mobile?users[0]||null:null);
 if(!mobile&&!state.chatId)state.chatId=selected;
 const person=selected?byId(selected):null;
 const msgs=selected?state.messages.filter(m=>(m.sender_id===me()&&m.recipient_id===selected)||(m.recipient_id===me()&&m.sender_id===selected)):[];
 const messagesById=new Map(msgs.map(m=>[m.id,m]));
 const list=users.map(id=>{
  const p=byId(id),last=[...state.messages].reverse().find(m=>(m.sender_id===me()&&m.recipient_id===id)||(m.recipient_id===me()&&m.sender_id===id));
  const name=p?.display_name||'Користувач';
  return `<button data-action="chat-open" data-id="${esc(id)}" data-chat-name="${esc(name.toLowerCase())}" class="chat-list-item ${selected===id?'is-active':''}">${avatar(p,'sm')}<span class="chat-list-meta"><b>${esc(name)}</b><small>${esc(last?.body?.slice(0,60)||'Почніть спілкування')}</small></span>${last?`<time>${esc(chatClock(last.created_at))}</time>`:''}</button>`;
 }).join('');
 let currentDay='';
 const thread=msgs.map(m=>{
  const day=chatDay(m.created_at),sep=day!==currentDay?`<div class="chat-date"><span>${esc(day)}</span></div>`:'';currentDay=day;
  const author=byId(m.sender_id)||{display_name:'Користувач'};
  const mine=m.sender_id===me();
  const parent=m.reply_to?messagesById.get(m.reply_to):null;
  const quote=parent?`<div class="chat-quote"><b>${esc(byId(parent.sender_id)?.display_name||'Користувач')}</b><p>${esc(parent.body.slice(0,180))}</p></div>`:'';
  const buttons=`<div class="chat-message-actions"><button data-action="chat-reply" data-id="${esc(m.id)}" title="Відповісти на повідомлення">↪ Відповісти</button><button data-action="chat-copy" data-id="${esc(m.id)}">Копіювати</button>${mine?`<button data-action="chat-edit" data-id="${esc(m.id)}">Редагувати</button><button data-action="chat-delete" data-id="${esc(m.id)}">Видалити</button>`:''}</div>`;
  return `${sep}<div class="chat-message ${mine?'mine':''}" data-message-id="${esc(m.id)}">${avatar(author,'sm')}<div class="chat-message-body"><div class="chat-message-heading"><a href="#" data-action="profile-open" data-id="${esc(m.sender_id)}">${esc(author.display_name)}</a><time>${esc(chatClock(m.created_at))}</time>${m.edited_at?'<em class="edit-indicator">редаговано</em>':''}</div>${quote}<p>${esc(m.body)}</p>${buttons}</div></div>`;
 }).join('');
 const edited=msgs.find(m=>m.id===state.chatEditId&&m.sender_id===me());
 const quoted=msgs.find(m=>m.id===state.chatReplyId);
 const ctx=edited?`Редагування повідомлення: ${esc(edited.body.slice(0,90))}`:quoted?`Відповідь для ${esc(byId(quoted.sender_id)?.display_name||'користувача')}: ${esc(quoted.body.slice(0,80))}`:'';
 const context=ctx?`<div class="chat-compose-context"><span>${ctx}</span><button type="button" data-action="chat-compose-cancel" title="Скасувати">×</button></div>`:'';
 return `<h1 class="page-title">Мої повідомлення</h1><div class="panel message-layout ${selected?'has-chat':''}"><div class="conversation-list"><div class="chat-list-heading">Діалоги <span>${users.length}</span></div><div class="chat-search-wrap"><input class="chat-search" id="chatSearch" autocomplete="off" placeholder="Пошук діалогу..." aria-label="Пошук діалогу"></div>${users.length?list:'<div class="empty chat-list-empty">Знайди людину через «Друзі» та напиши їй.</div>'}</div><div class="chat-panel">${person?`<div class="chat-head"><button class="mobile-chat-back" type="button" data-action="chat-back" aria-label="Назад до діалогів">‹</button>${avatar(person,'sm')}<span class="chat-contact"><a href="#" data-action="profile-open" data-id="${esc(person.id)}">${esc(person.display_name)}</a><small>@${esc(person.username||'konta')}</small></span><span class="chat-head-title">Листування</span></div><div class="message-scroll" id="messageScroll">${thread||'<div class="empty chat-empty">Почни розмову з привітання!</div>'}</div><form id="messageForm" class="message-send">${context}<button type="button" class="chat-emoji" data-action="emoji-insert" aria-label="Додати смайлик">☺</button><textarea name="body" rows="2" maxlength="2000" required placeholder="Написати повідомлення..." aria-label="Текст повідомлення">${esc(messageDrafts.get(selected)||'')}</textarea><button class="btn primary chat-send-btn" type="submit">${edited?'Зберегти':'Надіслати'}</button><small class="chat-send-hint">${state.preferences?.enter_to_send===false?'Ctrl+Enter або кнопка — надіслати':'Enter — надіслати · Shift+Enter — новий рядок'}</small></form>`:'<div class="empty chat-empty"><span class="empty-emoji">✉</span><strong>Мої повідомлення</strong>Вибери діалог або відкрий профіль друга.</div>'}</div></div>`;
}
function viewBookmarks(){const liked=state.posts.filter(p=>state.likes.some(l=>l.user_id===me()&&l.post_id===p.id));return `<h1 class="page-title">Мої закладки</h1><div class="panel">${header('Вподобані записи')}</div>${liked.length?liked.map(postCard).join(''):empty('Закладок поки немає','Постав ♥ на допис — і він з’явиться тут.','☆')}`}
function viewSettings(){return window.KONTA_CLASSIC?.renderSettings()||empty('Налаштування','Завантаження інтерфейсу...')}
function viewNotifications(){const notices=state.notifications;const labels={friend:'надіслав(-ла) заявку в друзі',like:'вподобав(-ла) твій допис',comment:'прокоментував(-ла) твій допис',message:'написав(-ла) тобі повідомлення'};return `<h1 class="page-title">Сповіщення</h1><div class="panel">${header('Нові події','<button class="btn soft small" data-action="notice-read">Позначити прочитаними</button>')} ${notices.length?notices.map(n=>`<div class="notice ${n.is_read?'':'is-unread'}">${avatar(byId(n.actor_id),'sm')}<div class="notice-body"><a href="#" data-action="profile-open" data-id="${esc(n.actor_id)}">${esc(byId(n.actor_id)?.display_name||'Користувач')}</a> ${esc(labels[n.kind]||'є новина для тебе')}<small>${esc(fmtTime(n.created_at))}</small></div></div>`).join(''):'<div class="empty">Сповіщень поки немає</div>'}</div>`}
function render(){if(!state.user)return;$$('[data-nav]').forEach(n=>n.classList.toggle('is-active',n.dataset.nav===state.view));$$('.bottom-nav [data-nav]').forEach(n=>n.classList.toggle('is-active',n.dataset.nav===state.view));renderSuggestions();const views={feed:viewFeed,profile:viewProfile,friends:viewFriends,explore:viewExplore,photos:viewPhotos,videos:viewVideos,music:viewMusic,settings:viewSettings,bookmarks:viewBookmarks,groups:viewGroups,group:viewGroup,messages:viewMessages,notifications:viewNotifications};$('#main').innerHTML=initialLoadError?setupError():(views[state.view]||viewFeed)();$('#main').dataset.renderedView=state.view;if(state.view==='messages'){$('#messageScroll')?.scrollTo(0,999999)} }
function go(view,opts={}){state.view=view;if('userId'in opts)state.profileId=opts.userId;if('chatId'in opts)state.chatId=opts.chatId;if('groupId'in opts)state.groupId=opts.groupId;if('search'in opts){state.search=opts.search;if(view==='explore')schedulePeopleSearch(state.search)}render();if(window.innerWidth<720)window.scrollTo({top:0,behavior:'smooth'})}
function openPost(groupId=null){state.postGroupId=groupId;$('#postText').value='';$('#postFile').value='';$('#postFileLabel').textContent='До 8 МБ';$('#postPreview').hidden=true;feedback('#postFeedback','');$('#postDialog').showModal()}
function openProfileEditor(){const p=state.profile;if(!p)return;$('#profileName').value=p.display_name;$('#profileUsername').value=p.username;$('#profileBio').value=p.bio||'';$('#avatarFile').value='';feedback('#profileFeedback','');$('#profileDialog').showModal()}
function verifyFile(file,avatarMode=false){if(!file)return null;const types=avatarMode?['image/png','image/jpeg','image/webp']:['image/png','image/jpeg','image/webp','image/gif'];if(!types.includes(file.type))throw Error('Підтримуються лише JPG, PNG, WebP'+(avatarMode?'':' та GIF')+'.');if(file.size>8*1024*1024)throw Error('Зображення має бути не більше 8 МБ.');return file}
async function uploadImage(file,kind){verifyFile(file,kind==='avatar');const ext=({"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif"})[file.type];const filePath=`${me()}/${kind}-${crypto.randomUUID()}.${ext}`;const {error}=await db.storage.from('konta-media').upload(filePath,file,{contentType:file.type,upsert:false,cacheControl:'3600'});if(error)throw error;const {data}=db.storage.from('konta-media').getPublicUrl(filePath);return data.publicUrl}
async function handleAuthSubmit(ev){ev.preventDefault();if(!db){feedback('#authFeedback','Підключення не налаштоване. Перевір config.js.',true);return}const email=$('#authEmail').value.trim(),password=$('#authPassword').value;setBusy('#authSubmit',true);feedback('#authFeedback','Підключаємось...');try{if(authMode==='signup'){const name=$('#authName').value.trim();if(!name)throw Error('Введи своє ім’я.');const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(!data.session)feedback('#authFeedback','Акаунт створено! Перевір пошту та натисни посилання для підтвердження. Потім увійди.');else await signedIn(data.user)}else if(authMode==='reset'){const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;feedback('#authFeedback','Якщо такий email існує, на нього прийде лист для відновлення пароля.')}else{const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;await signedIn(data.user)}}catch(error){feedback('#authFeedback',errText(error),true)}finally{setBusy('#authSubmit',false)}}
async function handlePostSubmit(ev){ev.preventDefault();if(loading)return;loading=true;setBusy('#postSubmit',true);feedback('#postFeedback','Публікуємо...');try{const text=$('#postText').value.trim();const file=$('#postFile').files[0];if(!text&&!file)throw Error('Напиши текст або додай фото.');const image=file?await uploadImage(file,'post'):null;const {error}=await db.from('posts').insert({user_id:me(),body:text,media_url:image,community_id:state.postGroupId});if(error)throw error;$('#postDialog').close();if(state.postGroupId)go('group',{groupId:state.postGroupId});else go('feed');await afterChange('Допис опубліковано!')}catch(error){feedback('#postFeedback',errText(error),true)}finally{loading=false;setBusy('#postSubmit',false)}}
async function handleProfileSubmit(ev){ev.preventDefault();if(loading)return;loading=true;setBusy('#profileSubmit',true);feedback('#profileFeedback','Зберігаємо...');try{const name=$('#profileName').value.trim(),username=$('#profileUsername').value.trim().toLowerCase(),bio=$('#profileBio').value.trim();if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error('Нікнейм: 3–24 латинські літери, цифри або _.');if(!name)throw Error('Введи ім’я.');const file=$('#avatarFile').files[0];const avatar_url=file?await uploadImage(file,'avatar'):state.profile?.avatar_url||null;const {error}=await db.from('profiles').update({display_name:name,username,bio,avatar_url}).eq('id',me());if(error)throw error;$('#profileDialog').close();await afterChange('Профіль оновлено!')}catch(error){feedback('#profileFeedback',errText(error),true)}finally{loading=false;setBusy('#profileSubmit',false)}}
async function handleGroupSubmit(ev){ev.preventDefault();if(loading)return;loading=true;setBusy('#groupSubmit',true);feedback('#groupFeedback','Створюємо...');try{const name=$('#groupName').value.trim(),description=$('#groupDescription').value.trim();const {data,error}=await db.from('communities').insert({owner_id:me(),name,description}).select('id').single();if(error)throw error;const join=await db.from('community_members').insert({community_id:data.id,user_id:me()});if(join.error)throw join.error;$('#groupDialog').close();await afterChange('Спільноту створено!');go('group',{groupId:data.id})}catch(error){feedback('#groupFeedback',errText(error),true)}finally{loading=false;setBusy('#groupSubmit',false)}}
async function handleResetSubmit(ev){ev.preventDefault();const pw=$('#resetPassword').value;if(pw.length<6)return feedback('#resetFeedback','Мінімум 6 символів.',true);const {error}=await db.auth.updateUser({password:pw});if(error){feedback('#resetFeedback',errText(error),true);return}$('#resetDialog').close();toast('Пароль змінено.');}

/* Lightweight updates: actions only repaint the UI node that actually changed. */
function paintPostLike(id){
 if(!idOK(id))return;
 const post=document.getElementById('post-'+id);
 if(!post)return;
 const count=state.likes.filter(l=>l.post_id===id).length;
 const liked=state.likes.some(l=>l.post_id===id&&l.user_id===me());
 const btn=post.querySelector('[data-action="post-like"]');
 if(btn){btn.classList.toggle('is-liked',liked);btn.setAttribute('aria-pressed',String(liked));btn.innerHTML='<span>'+(liked?'♥':'♡')+'</span>'+count;}
 if(!liked&&(state.view==='bookmarks'||state.view==='feed'&&state.feedFilter==='liked'))post.remove();
}
function paintCommentLike(id){
 if(!idOK(id))return;
 const likes=state.commentLikes.filter(l=>l.comment_id===id),liked=likes.some(l=>l.user_id===me());
 document.querySelectorAll('[data-action="comment-like"][data-id="'+id+'"]').forEach(btn=>{
  btn.classList.toggle('is-liked',liked);
  btn.setAttribute('aria-pressed',String(liked));
  btn.setAttribute('aria-label',liked?'Прибрати лайк з коментаря':'Вподобати коментар');
  btn.innerHTML=(liked?'♥':'♡')+' <span>'+(likes.length||'')+'</span>';
 });
}
function paintAllReactions(){
 document.querySelectorAll('[data-action="post-like"]').forEach(btn=>paintPostLike(btn.dataset.id));
 document.querySelectorAll('[data-action="comment-like"]').forEach(btn=>paintCommentLike(btn.dataset.id));
}
function paintPostComments(postId,preserveDraft=true){
 if(!idOK(postId))return;
 const card=document.getElementById('post-'+postId);
 const post=state.posts.find(p=>p.id===postId);
 if(!card||!post)return;
 const old=card.querySelector('.comment-area');
 if(!old)return;
 const form=old.querySelector('.comment-form');
 const draft=preserveDraft&&form?form.querySelector('[name="comment"]')?.value||'':'';
 const parentId=preserveDraft&&form?form.dataset.parentId||'':'';
 const focused=preserveDraft&&form&&form.contains(document.activeElement);
 const temp=document.createElement('div');
 temp.innerHTML=postCard(post);
 const updated=temp.querySelector('.comment-area');
 if(!updated)return;
 old.replaceWith(updated);
 const count=state.comments.filter(c=>c.post_id===postId).length;
 const countButton=card.querySelector('[data-action="comment-focus"]');
 if(countButton)countButton.innerHTML='<span>▢</span>'+count+' коментарів';
 const newForm=updated.querySelector('.comment-form');
 if(newForm&&draft){newForm.querySelector('[name="comment"]').value=draft}
 if(newForm&&parentId){
  newForm.dataset.parentId=parentId;
  const parent=state.comments.find(c=>c.id===parentId);
  const banner=newForm.querySelector('.reply-banner');
  if(banner){banner.hidden=false;newForm.querySelector('.reply-caption').textContent='Відповідь для '+(byId(parent?.user_id)?.display_name||'користувача')}
  newForm.querySelector('[name="comment"]').placeholder='Напишіть відповідь...';
 }
 if(focused)newForm?.querySelector('[name="comment"]')?.focus({preventScroll:true});
}
async function reloadCommentsForPost(postId,preserveDraft=false){
 const {data,error}=await db.from('comments').select('*').eq('post_id',postId).order('created_at',{ascending:true}).limit(500);
 if(error)throw error;
 state.comments=state.comments.filter(c=>c.post_id!==postId).concat(data||[]);
 paintPostComments(postId,preserveDraft);
}
async function togglePostLike(id){
 if(!idOK(id)||!state.posts.some(p=>p.id===id))return;
 const key='post:'+id;if(pendingReactions.has(key))return;
 pendingReactions.add(key);
 const prev=state.likes,liked=prev.some(l=>l.post_id===id&&l.user_id===me());
 state.likes=liked?prev.filter(l=>!(l.post_id===id&&l.user_id===me())):[...prev,{post_id:id,user_id:me(),created_at:new Date().toISOString()}];
 paintPostLike(id);
 try{
  const req=liked?db.from('likes').delete().eq('post_id',id).eq('user_id',me()):db.from('likes').insert({post_id:id,user_id:me()});
  const {error}=await req;
  if(error)throw error;
 }catch(error){state.likes=prev;paintPostLike(id);toast(errText(error));}
 finally{pendingReactions.delete(key)}
}
async function toggleCommentLike(id){
 if(!idOK(id)||!state.comments.some(c=>c.id===id))return;
 const key='comment:'+id;if(pendingReactions.has(key))return;
 pendingReactions.add(key);
 const prev=state.commentLikes,liked=prev.some(l=>l.comment_id===id&&l.user_id===me());
 state.commentLikes=liked?prev.filter(l=>!(l.comment_id===id&&l.user_id===me())):[...prev,{comment_id:id,user_id:me(),created_at:new Date().toISOString()}];
 paintCommentLike(id);
 try{
  const req=liked?db.from('comment_likes').delete().eq('comment_id',id).eq('user_id',me()):db.from('comment_likes').insert({comment_id:id,user_id:me()});
  const {error}=await req;
  if(error)throw error;
 }catch(error){state.commentLikes=prev;paintCommentLike(id);toast(errText(error));}
 finally{pendingReactions.delete(key)}
}
function paintChatWithoutRemount(){
 if(state.view!=='messages')return;
 const current=document.querySelector('#messageScroll');
 const parent=$('.message-layout');
 if(!parent)return;
 const preservedInput=$('#messageForm textarea');
 const currentDraft=preservedInput?.value||'';
 const currentSearch=$('#chatSearch')?.value||'';
 const nearBottom=current?current.scrollHeight-current.scrollTop-current.clientHeight<130:true;
 const oldPos=current?.scrollTop||0;
 const tmp=document.createElement('div');tmp.innerHTML=viewMessages();
 const nextScroll=tmp.querySelector('#messageScroll');
 if(current&&nextScroll){
  current.innerHTML=nextScroll.innerHTML;
  current.scrollTop=nearBottom?current.scrollHeight:oldPos;
 }
 const currentList=parent.querySelector('.conversation-list'),newList=tmp.querySelector('.conversation-list');
 if(currentList&&newList){
  currentList.querySelectorAll('.chat-list-item,.chat-list-empty').forEach(n=>n.remove());
  const rows=Array.from(newList.querySelectorAll('.chat-list-item'));
  if(rows.length){for(const row of rows)currentList.appendChild(row)}
  else{
   const empty=newList.querySelector('.chat-list-empty');
   if(empty)currentList.appendChild(empty);
  }
  const count=currentList.querySelector('.chat-list-heading span');if(count)count.textContent=String(rows.length);
  const search=currentList.querySelector('#chatSearch');if(search)search.value=currentSearch;
  if(currentSearch){const q=currentSearch.toLocaleLowerCase('uk-UA');rows.forEach(n=>n.hidden=!n.dataset.chatName?.includes(q))}
 }
 if(preservedInput&&document.contains(preservedInput))preservedInput.value=currentDraft;
}


async function refreshFriendshipUI(){
 const id=me();
 const {data,error}=await db.from('friendships').select('*').or('requester_id.eq.'+id+',addressee_id.eq.'+id).limit(1000);
 if(error)throw error;
 state.friends=data||[];
 renderSuggestions();
 if(state.view==='friends'){
  const tmp=document.createElement('div');tmp.innerHTML=viewFriends();
  const current=$('#main .person-list'),updated=tmp.querySelector('.person-list');
  if(current&&updated)current.innerHTML=updated.innerHTML;
  const tabsCurrent=$('#main .feed-tabs button'),tabsNew=Array.from(tmp.querySelectorAll('.feed-tabs button'));
  tabsCurrent.forEach((button,i)=>{if(tabsNew[i])button.innerHTML=tabsNew[i].innerHTML});
 }else if(state.view==='explore'){
  const area=$('#searchResults');
  if(area)area.innerHTML=searchResultsHtml(state.search);
 }else if(state.view==='profile'&&(state.profileId||me())!==me()){
  const id=state.profileId;
  const actions=$('#main .profile-classic-actions');
  if(actions)actions.innerHTML=friendAction(id)+' <button class="btn primary small" data-action="chat-open" data-id="'+esc(id)+'">Написати повідомлення</button>';
 }
}
async function refreshMembershipUI(){
 const {data,error}=await db.from('community_members').select('*').limit(3000);
 if(error)throw error;
 state.members=data||[];
 if(state.view==='group'){
  const tmp=document.createElement('div');tmp.innerHTML=viewGroup();
  const main=$('#main');
  const oldHead=main?.querySelector('.panel'),freshHead=tmp.querySelector('.panel');
  if(oldHead&&freshHead)oldHead.replaceWith(freshHead);
  const oldComposer=main?.querySelector('.composer-teaser'),freshComposer=tmp.querySelector('.composer-teaser');
  if(oldComposer&&!freshComposer)oldComposer.remove();
  else if(!oldComposer&&freshComposer&&freshHead)freshHead.after(freshComposer);
 }
 if(state.view==='groups'){
  const panel=$('#main .panel');
  const tmp=document.createElement('div');tmp.innerHTML=viewGroups();
  const fresh=tmp.querySelector('.panel');
  if(panel&&fresh)panel.innerHTML=fresh.innerHTML;
 }
 renderSuggestions();
}

async function performAction(action,id,node){if(!state.user&&!['reload'].includes(action))return;try{
 switch(action){
 case 'reload':initialLoadError=null;await loadAll(true);break;
 case 'post-open':openPost();break;
 case 'group-post':openPost(id);break;
 case 'profile-edit':openProfileEditor();break;
 case 'profile-open':if(idOK(id))go('profile',{userId:id});break;
 case 'chat-open':if(idOK(id)){state.chatReplyId=null;state.chatEditId=null;go('messages',{chatId:id});}break;
 case 'group-open':if(idOK(id))go('group',{groupId:id});break;
 case 'group-create':$('#groupName').value='';$('#groupDescription').value='';feedback('#groupFeedback','');$('#groupDialog').showModal();break;
 case 'feed-tab':state.feedFilter=id;render();break;
 case 'friends-tab':state.friendsTab=id;render();if(id==='people'&&state.friendSearch)schedulePeopleSearch(state.friendSearch);break;
 case 'comment-focus':$('#post-'+id+' .comment-form input')?.focus();break;
 case 'comment-expand':{if(expandedComments.has(id))expandedComments.delete(id);else expandedComments.add(id);paintPostComments(id);break}
 case 'comment-reply':{const comment=state.comments.find(c=>c.id===id);if(!comment)break;expandedComments.add(comment.post_id);paintPostComments(comment.post_id);const form=$(`#post-${comment.post_id} .comment-form`);if(!form)break;form.dataset.parentId=id;$('.reply-banner',form).hidden=false;$('.reply-caption',form).textContent=`Відповідь для ${byId(comment.user_id)?.display_name||'користувача'}`;const input=$('[name="comment"]',form);input.placeholder='Напишіть відповідь...';input.focus();break}
 case 'comment-reply-cancel':{const form=$(`#post-${id} .comment-form`);if(!form)break;delete form.dataset.parentId;$('.reply-banner',form).hidden=true;const input=$('[name="comment"]',form);input.placeholder='Написати коментар...';input.focus();break}
 case 'comment-like':await toggleCommentLike(id);break;
 case 'chat-back':state.chatId=null;state.chatReplyId=null;state.chatEditId=null;render();break;
 case 'chat-reply':{const m=state.messages.find(x=>x.id===id&&(x.sender_id===state.chatId||x.recipient_id===state.chatId));if(!m)break;state.chatReplyId=id;state.chatEditId=null;render();$('#messageForm textarea')?.focus();break}
 case 'chat-edit':{const m=state.messages.find(x=>x.id===id&&x.sender_id===me()&&x.recipient_id===state.chatId);if(!m)break;state.chatEditId=id;state.chatReplyId=null;messageDrafts.set(state.chatId,m.body);render();$('#messageForm textarea')?.focus();break}
 case 'chat-compose-cancel':state.chatReplyId=null;state.chatEditId=null;messageDrafts.delete(state.chatId);render();$('#messageForm textarea')?.focus();break;
 case 'chat-copy':{const m=state.messages.find(x=>x.id===id&&((x.sender_id===me()&&x.recipient_id===state.chatId)||(x.recipient_id===me()&&x.sender_id===state.chatId)));if(!m)break;if(navigator.clipboard){await navigator.clipboard.writeText(m.body);toast('Повідомлення скопійовано');}else toast('Копіювання недоступне у браузері');break}
 case 'chat-delete':{const m=state.messages.find(x=>x.id===id&&x.sender_id===me());if(!m)break;if(!confirm('Видалити своє повідомлення в обох учасників розмови?'))break;const {error}=await db.from('private_messages').delete().eq('id',m.id).eq('sender_id',me());if(error)throw error;if(state.chatEditId===id)state.chatEditId=null;if(state.chatReplyId===id)state.chatReplyId=null;await afterChange('Повідомлення видалено');break}

 case 'emoji-insert':{const el=$('#messageForm textarea');if(!el)break;const start=el.selectionStart,end=el.selectionEnd;el.value=el.value.slice(0,start)+'🙂'+el.value.slice(end);el.selectionStart=el.selectionEnd=start+2;messageDrafts.set(state.chatId,el.value);el.focus();break} 
 case 'post-find':{const p=state.posts.find(p=>p.id===id);if(p?.community_id)go('group',{groupId:p.community_id});else go('feed');setTimeout(()=>$('#post-'+id)?.scrollIntoView({behavior:'smooth',block:'center'}),80);break}
 case 'share':{
  const p=state.posts.find(p=>p.id===id);if(!p)break;
  const url=location.origin+location.pathname+'#post='+encodeURIComponent(p.id);
  if(navigator.share){try{await navigator.share({title:'KONTA',text:p.body?.slice(0,130)||'Допис у KONTA',url})}catch(_){}}else if(navigator.clipboard){await navigator.clipboard.writeText(url);toast('Посилання на допис скопійовано')}else toast('Копіювання недоступне');
  break;
 }
 case 'post-like':await togglePostLike(id);break;
 case 'post-delete':{const p=state.posts.find(p=>p.id===id);if(p?.user_id!==me())break;if(!confirm('Видалити цей допис?'))break;const {error}=await db.from('posts').delete().eq('id',id).eq('user_id',me());if(error)throw error;state.posts=state.posts.filter(x=>x.id!==id);document.getElementById('post-'+id)?.remove();toast('Допис видалено');break}
 case 'comment-delete':{const c=state.comments.find(c=>c.id===id);if(!c||c.user_id!==me())break;const {error}=await db.from('comments').delete().eq('id',id).eq('user_id',me());if(error)throw error;await reloadCommentsForPost(c.post_id);break}
 case 'friend-add':{if(id===me()||!idOK(id))break;const {error}=await db.from('friendships').insert({requester_id:me(),addressee_id:id,status:'pending'});if(error)throw error;await refreshFriendshipUI();toast('Запит у друзі надіслано!');break}
 case 'friend-accept':{const rec=friendRecord(id);if(!rec||rec.addressee_id!==me())break;const {error}=await db.from('friendships').update({status:'accepted'}).eq('id',rec.id).eq('addressee_id',me());if(error)throw error;await refreshFriendshipUI();toast('Тепер ви друзі!');break}
 case 'friend-remove':{const rec=friendRecord(id);if(!rec)break;const {error}=await db.from('friendships').delete().eq('id',rec.id);if(error)throw error;await refreshFriendshipUI();toast(rec.status==='accepted'?'Видалено з друзів':'Заявку скасовано');break}
 case 'group-join':{if(!idOK(id))break;const {error}=await db.from('community_members').insert({community_id:id,user_id:me()});if(error)throw error;await refreshMembershipUI();toast('Ти вступив(-ла) у спільноту!');break}
 case 'group-leave':{if(!idOK(id))break;const {error}=await db.from('community_members').delete().eq('community_id',id).eq('user_id',me());if(error)throw error;await refreshMembershipUI();toast('Ти вийшов(-ла) зі спільноти');break}
 case 'notice-read':{const {error}=await db.from('notifications').update({is_read:true}).eq('target_id',me()).eq('is_read',false);if(error)throw error;state.notifications=state.notifications.map(n=>({...n,is_read:true}));document.querySelectorAll('.notice.is-unread').forEach(n=>n.classList.remove('is-unread'));const dot=$('#noticeDot');if(dot)dot.hidden=true;toast('Сповіщення прочитано');break}
 default:if(action.startsWith('media-')&&window.KONTA_MEDIA)await window.KONTA_MEDIA.action(action,id);else if(action.startsWith('classic-')&&window.KONTA_CLASSIC)await window.KONTA_CLASSIC.action(action,id,node);break;
 }}catch(error){toast(errText(error))}}
async function submitComment(form){
 const postId=form.dataset.postId,body=$('[name="comment"]',form).value.trim();
 if(!body||!idOK(postId))return;
 const btn=$('button[type="submit"]',form);
 btn.disabled=true;
 try{
  const parentId=form.dataset.parentId||null;
  if(parentId&&!state.comments.some(c=>c.id===parentId&&c.post_id===postId))throw Error('Неправильна відповідь.');
  const {error}=await db.from('comments').insert({post_id:postId,user_id:me(),body,parent_id:parentId});
  if(error)throw error;
  expandedComments.add(postId);
  await reloadCommentsForPost(postId,false);
  toast(parentId?'Відповідь додано':'Коментар додано');
 }catch(error){toast(errText(error));if(document.contains(btn))btn.disabled=false}
}
async function sendMessage(form){
 if(!state.chatId||!idOK(state.chatId))return;
 const input=$('[name="body"]',form),body=input.value.trim();if(!body)return;
 const btn=$('button[type="submit"]',form);btn.disabled=true;
 try{
  let error=null;
  const currentChat=state.chatId;
  const editing=state.chatEditId?state.messages.find(m=>m.id===state.chatEditId&&m.sender_id===me()&&m.recipient_id===currentChat):null;
  if(editing){
   ({error}=await db.from('private_messages').update({body,edited_at:new Date().toISOString()}).eq('id',editing.id).eq('sender_id',me()));
  }else{
   const parent=state.chatReplyId?state.messages.find(m=>m.id===state.chatReplyId&&((m.sender_id===me()&&m.recipient_id===currentChat)||(m.recipient_id===me()&&m.sender_id===currentChat))):null;
   ({error}=await db.from('private_messages').insert({sender_id:me(),recipient_id:currentChat,body,reply_to:parent?.id||null}));
  }
  if(error)throw error;
  messageDrafts.delete(currentChat);state.chatReplyId=null;state.chatEditId=null;input.value='';
  await afterChange(editing?'Повідомлення змінено':null);
 }catch(error){toast(errText(error));btn.disabled=false}
}
function wireEvents(){
 $$('[data-mode]').forEach(button=>button.addEventListener('click',()=>changeAuthMode(button.dataset.mode)));
 $('#forgotBtn').addEventListener('click',()=>changeAuthMode(authMode==='reset'?'login':'reset'));
 $('#authForm').addEventListener('submit',handleAuthSubmit);
 $('#postForm').addEventListener('submit',handlePostSubmit);
 $('#profileForm').addEventListener('submit',handleProfileSubmit);
 $('#groupForm').addEventListener('submit',handleGroupSubmit);
 $('#resetForm').addEventListener('submit',handleResetSubmit);
 $('#postFile').addEventListener('change',event=>{try{const file=verifyFile(event.target.files[0]);if(!file)return;$('#postFileLabel').textContent=`${file.name} (${(file.size/1048576).toFixed(1)} МБ)`;const preview=$('#postPreview');preview.src=URL.createObjectURL(file);preview.hidden=false;}catch(error){event.target.value='';feedback('#postFeedback',errText(error),true)}});
 $('#settingsBtn').addEventListener('click',openProfileEditor);
 $('#mobileSettingsBtn').addEventListener('click',()=>{document.querySelector('.mobile-more')?.removeAttribute('open');openProfileEditor()});
 $('#mobileCreate').addEventListener('click',()=>openPost());
 const signOut=async()=>{document.querySelector('.mobile-more')?.removeAttribute('open');const {error}=await db.auth.signOut();if(error)toast(errText(error));else{authBoot=false;showAuth();toast('Ти вийшов(-ла) з акаунта')}};
 $('#logoutBtn').addEventListener('click',signOut);
 $('#mobileLogoutBtn').addEventListener('click',signOut);
 $('#topSearch').addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();const dropdown=$('#topSearchResults');if(dropdown)dropdown.hidden=true;go('explore',{search:e.target.value.trim()});}
  else if(e.key==='Escape'){const dropdown=$('#topSearchResults');if(dropdown)dropdown.hidden=true;e.target.blur();}
 });
 $('#topSearch').addEventListener('input',e=>schedulePeopleSearch(e.target.value));
 $('#topSearch').addEventListener('focus',()=>repaintPeopleResults());
 document.addEventListener('input',event=>{if(event.target.id==='exploreInput'){state.search=event.target.value;schedulePeopleSearch(state.search)}if(event.target.matches('#messageForm textarea[name="body"]')&&state.chatId)messageDrafts.set(state.chatId,event.target.value);if(event.target.id==='chatSearch'){const q=event.target.value.trim().toLocaleLowerCase('uk-UA');$('.chat-list-item').forEach(n=>n.hidden=!n.dataset.chatName?.includes(q))}if(event.target.id==='friendsSearchInput'){state.friendSearch=event.target.value;schedulePeopleSearch(state.friendSearch)}});
 document.addEventListener('submit',e=>{if(e.target.matches('.comment-form')){e.preventDefault();submitComment(e.target)}else if(e.target.id==='messageForm'){e.preventDefault();sendMessage(e.target)}});
 document.addEventListener('keydown',e=>{if(e.target.matches('#messageForm textarea[name="body"]')&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&(state.preferences?.enter_to_send!==false||e.ctrlKey||e.metaKey)){e.preventDefault();e.target.closest('form')?.requestSubmit()}});
 document.addEventListener('click',e=>{
  const closer=e.target.closest('[data-close]');if(closer){document.getElementById(closer.dataset.close)?.close();return}
  const nav=e.target.closest('[data-nav]');if(nav){
   e.preventDefault();
   document.querySelector('.mobile-more')?.removeAttribute('open');
   const view=nav.dataset.nav;
   const dropdown=$('#topSearchResults');if(dropdown)dropdown.hidden=true;
   if(view==='messages'){state.chatReplyId=null;state.chatEditId=null;if(window.innerWidth<=720)state.chatId=null;}
   const options=view==='profile'?{userId:me()}:view==='explore'?{search:nav.closest('#topSearchResults')?$('#topSearch').value.trim():state.search}:{};
   go(view,options);
   return;
  }
  const act=e.target.closest('[data-action]');if(act){e.preventDefault();const dropdown=$('#topSearchResults');if(dropdown)dropdown.hidden=true;performAction(act.dataset.action,act.dataset.id,act);return}
 });
 document.addEventListener('pointerdown',e=>{const m=document.querySelector('.mobile-more');if(m?.open&&!m.contains(e.target))m.removeAttribute('open');const dropdown=$('#topSearchResults');if(dropdown&&!e.target.closest('.top-search'))dropdown.hidden=true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.user)loadAll(true)});
 window.addEventListener('focus',()=>{if(state.user)loadAll(true)});
}
async function boot(){wireEvents();changeAuthMode('login');if(!db){feedback('#authFeedback','Не вдалося завантажити Supabase. Перевір підключення до інтернету та файли config.js і app.js.',true);$('#authSubmit').disabled=true;return;}
  db.auth.onAuthStateChange((event,session)=>{
    // Avoid awaiting Supabase queries inside this callback.
    if(event==='SIGNED_OUT'){authBoot=false;showAuth();return}
    if(event==='PASSWORD_RECOVERY'){setTimeout(()=>{$('#resetPassword').value='';feedback('#resetFeedback','');$('#resetDialog').showModal()},100);}
    if(session?.user&&event==='SIGNED_IN'&&(!state.user||state.user.id!==session.user.id)){setTimeout(()=>signedIn(session.user),0)}
  });
  const {data,error}=await db.auth.getSession();if(error){feedback('#authFeedback',errText(error),true);return}
  if(data.session?.user)await signedIn(data.session.user);else showAuth();
}
boot().catch(error=>feedback('#authFeedback',errText(error),true));
