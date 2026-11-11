'use strict';
// KONTA. Browser app backed by Supabase Auth, PostgreSQL and Storage.
const $ = (selector,scope=document) => scope.querySelector(selector);
const $$ = (selector,scope=document) => Array.from(scope.querySelectorAll(selector));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageSrc = url => typeof url==='string' && /^https:\/\//i.test(url) ? esc(url) : '';
const idOK = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
const fmtTime = value => {const d=new Date(value); if(Number.isNaN(d.valueOf()))return '';const diff=(Date.now()-d.getTime())/60000;if(diff>=0&&diff<1)return 'щойно';if(diff>=0&&diff<60)return `${Math.floor(diff)} хв тому`;if(diff>=0&&diff<1440)return `${Math.floor(diff/60)} год тому`;return new Intl.DateTimeFormat('uk-UA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(d)};
const state = {user:null,profile:null,profiles:[],posts:[],stories:[],polls:[],pollOptions:[],pollVotes:[],likes:[],comments:[],commentLikes:[],friends:[],follows:[],groups:[],members:[],messages:[],notifications:[],albums:[],library:[],mediaScope:'all',mediaAlbumId:null,preferences:null,prefsAppliedForUser:null,chatReplyId:null,chatEditId:null,view:'feed',feedFilter:'all',friendsTab:'all',search:'',profileId:null,chatId:null,groupId:null,postGroupId:null,editing:false};
const expandedComments = new Set();
let pendingPoll=null;
const messageDrafts = new Map();
const pendingReactions = new Set();
let peopleSearchTimer=null,peopleSearchVersion=0;
state.searchRemoteQuery='';state.searchRemoteMatches=[];state.friendSearch='';
const conf=window.KONTA_CONFIG || {};
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(conf.supabaseUrl||'') && /^(sb_publishable_|eyJ)/.test(conf.supabasePublishableKey||'');
const db = configured && window.supabase?.createClient ? window.supabase.createClient(conf.supabaseUrl,conf.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}}) : null;
let authMode='login', loading=false, authBoot=false, liveChannel=null, pollId=null, initialLoadError=null, refreshInFlight=false, refreshScheduled=false, lastToastTimer=null;
let lastKnownNotificationIds=null;
const me = () => state.user?.id;
const byId = id => state.profiles.find(p=>p.id===id) || (id===me() ? state.profile : null);
const myName = () => state.profile?.display_name || state.user?.email?.split('@')[0] || 'Ти';
const initials = p => ((p?.display_name||'K').trim().charAt(0)||'K').toUpperCase();
function presenceLabel(p){const t=p?.last_seen_at?new Date(p.last_seen_at).getTime():0;if(!t)return '<span class="konta-presence offline">ще не був(-ла) в мережі</span>';const age=Date.now()-t;return age<120000?'<span class="konta-presence online"><i class="konta-online-dot"></i>у мережі</span>':'<span class="konta-presence offline">був(-ла) в мережі '+esc(fmtTime(p.last_seen_at))+'</span>'}
let lastPresencePing=0;
async function pingPresence(){if(!state.user||document.visibilityState!=='visible'||Date.now()-lastPresencePing<45000)return;lastPresencePing=Date.now();const now=new Date().toISOString();const {error}=await db.from('profiles').update({last_seen_at:now}).eq('id',me());if(!error){const p=byId(me());if(p)p.last_seen_at=now;if(state.profile)state.profile.last_seen_at=now}}
setInterval(()=>{pingPresence()},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pingPresence()});
function verifiedBadge(p){return p?.is_verified?'<span class="konta-verified" role="img" title="Офіційний акаунт КОНТА" aria-label="Підтверджений акаунт">✓</span>':''}
function avatar(p,cls=''){const url=imageSrc(p?.avatar_url);return `<span class="avatar ${cls}">${url?`<img src="${url}" alt="">`:esc(initials(p))}</span>`;}
function feedback(selector,message,isError=false){const el=$(selector);if(el){el.textContent=message;el.classList.toggle('is-error',isError)}}
function toast(text){const node=$('#toast');node.textContent=text;node.classList.add('show');clearTimeout(lastToastTimer);lastToastTimer=setTimeout(()=>node.classList.remove('show'),3200)}
function setBusy(selector,busy){const node=$(selector);if(node)node.disabled=busy}
function errText(error){const msg=error?.message||String(error||'Невідома помилка');if(/Invalid login credentials/i.test(msg))return 'Неправильний email або пароль.';if(/Email not confirmed/i.test(msg))return 'Спочатку підтверди email за посиланням у пошті.';if(/User already registered/i.test(msg))return 'Цей email уже зареєстрований.';if(/Password should be at least/i.test(msg))return 'Пароль занадто короткий.';if(/Failed to fetch|NetworkError|fetch failed/i.test(msg))return 'Немає з’єднання. Перевір інтернет і онови сторінку.';if(/duplicate key|unique constraint/i.test(msg))return 'Це ім’я користувача вже зайняте.';if(/relation .* does not exist|schema cache|Could not find the table/i.test(msg))return 'Потрібно один раз запустити SETUP_SUPABASE.sql у Supabase → SQL Editor.';return msg}
function showAuth(){lastKnownNotificationIds=null;state.user=null;state.profile=null;state.prefsAppliedForUser=null;state.chatReplyId=null;state.chatEditId=null;$('#app').hidden=true;$('#authScreen').hidden=false;if(liveChannel&&db){db.removeChannel(liveChannel);liveChannel=null}clearInterval(pollId);pollId=null;}
function changeAuthMode(mode){authMode=mode;$$('[data-mode]').forEach(b=>b.classList.toggle('is-active',b.dataset.mode===mode));$('#authNameRow').hidden=mode!=='signup';$('#authName').required=mode==='signup';$('#authSurname').required=mode==='signup';$('#authPasswordRow').hidden=mode==='reset';$('#authPassword').required=mode!=='reset';$('#forgotBtn').textContent=mode==='reset'?'Повернутися до входу':'Забув пароль?';$('#authHeading').textContent=mode==='signup'?'Створи свою сторінку':mode==='reset'?'Відновити пароль':'З поверненням!';$('#authHint').textContent=mode==='signup'?'Реєстрація безкоштовна.':'Вкажи пошту — надішлемо посилання для відновлення.';if(mode==='login')$('#authHint').textContent='Увійди, щоб побачити новини друзів.';$('#authSubmit').textContent=mode==='signup'?'Зареєструватися':mode==='reset'?'Надіслати лист':'Увійти';$('#authPassword').autocomplete=mode==='signup'?'new-password':'current-password';feedback('#authFeedback','');}
function showApp(changed=null){
 if(!state.user)return;
 $('#authScreen').hidden=true;$('#app').hidden=false;
 $('#topMyName').innerHTML=esc(myName())+verifiedBadge(state.profile);
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
    ['stories',db.from('stories').select('*').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(150)],
    ['polls',db.from('polls').select('*').limit(300)],
    ['pollOptions',db.from('poll_options').select('*').limit(1000)],
    ['pollVotes',db.from('poll_votes').select('*').limit(3000)],
    ['likes',db.from('likes').select('*').limit(3000)],
    ['comments',db.from('comments').select('*').order('created_at',{ascending:true}).limit(3000)],
    ['commentLikes',db.from('comment_likes').select('*').limit(4000)],
    ['friends',db.from('friendships').select('*').or(`requester_id.eq.${id},addressee_id.eq.${id}`).limit(1000)],
    ['follows',db.from('follows').select('*').limit(3000)],
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
  const newNotices=lastKnownNotificationIds===null?[]:state.notifications.filter(n=>!n.is_read&&!lastKnownNotificationIds.has(n.id));
  lastKnownNotificationIds=new Set(state.notifications.map(n=>n.id));
  if(newNotices.length&&document.visibilityState==='visible')toast('🔔 Нове сповіщення у KONTA');
  if(state.searchRemoteMatches?.length){
   const known=new Set(state.profiles.map(p=>p.id));
   for(const p of state.searchRemoteMatches)if(!known.has(p.id)){state.profiles.push(p);known.add(p.id)}
  }
  if(window.KONTA_CLASSIC){state.preferences=window.KONTA_CLASSIC.applyPreferences(state.preferences);if(state.prefsAppliedForUser!==id){state.feedFilter=state.preferences.feed_default;state.prefsAppliedForUser=id;}}
  state.profile=byId(id);pingPresence();initialLoadError=state.profile?null:'Профіль не знайдено. Запусти SETUP_SUPABASE.sql у SQL Editor.';
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
function personRow(p,controls=true){return `<div class="person-row">${avatar(p)}<div class="person-text"><strong><a href="#" data-action="profile-open" data-id="${esc(p.id)}">${esc(p.display_name)}${verifiedBadge(p)}</a></strong><small>@${esc(p.username)} ${p.bio?'· '+esc(p.bio.slice(0,38)):''}</small></div>${controls?friendAction(p.id):''}</div>`}

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

function renderSuggestions(){const candidates=state.profiles.filter(p=>p.id!==me()&&!friendRecord(p.id)).slice(0,4);$('#suggestions').innerHTML=candidates.map(p=>personRow(p)).join('')||'<p class="subtle">Запроси друзів — вони з’являться тут.</p>';const count=state.friends.filter(f=>f.status==='pending'&&f.addressee_id===me()).length;$('#requestsBubble').hidden=!count;$('#requestsBubble').textContent=count;const unread=state.notifications.filter(n=>!n.is_read).length;const badge=$('#noticeDot');if(badge){badge.hidden=!unread;badge.textContent=unread>99?'99+':String(unread)}const nav=$('[data-nav="notifications"]');if(nav)nav.setAttribute('aria-label',`Сповіщення${unread?' — '+unread+' непрочитаних':''}`);document.querySelectorAll('.bottom-nav [data-nav="notifications"]').forEach(el=>{el.classList.toggle('has-unread',unread>0);el.setAttribute('aria-label',`Сповіщення${unread?' — '+unread+' непрочитаних':''}`)})}
function header(title,right=''){return `<div class="panel-header"><h2>${esc(title)}</h2>${right}</div>`}
function composer(){return `<div class="panel composer-teaser">${avatar(state.profile)}<button data-action="post-open">Що нового, ${esc(myName().split(' ')[0])}?</button><button class="tiny-action" title="Створити допис" aria-label="Створити допис" data-action="post-open">+</button></div>`}
function tabs(items,current,action){return `<div class="feed-tabs">${items.map(([key,label])=>`<button class="${current===key?'is-active':''}" data-action="${action}" data-id="${esc(key)}">${esc(label)}</button>`).join('')}</div>`}
function renderCommentNode(c,children,depth=0){
 const author=byId(c.user_id)||{display_name:'Користувач',username:'user'};
 const likes=state.commentLikes.filter(l=>l.comment_id===c.id),liked=likes.some(l=>l.user_id===me());
 const replies=children.get(c.id)||[];
 const own=c.user_id===me(),post=state.posts.find(p=>p.id===c.post_id);
 const canDelete=own||post?.user_id===me();
 return `<div class="comment-thread ${depth?'is-reply':''}" id="comment-${esc(c.id)}">
 <div class="comment-line">${avatar(author,'sm')}<div class="comment-content">
 <div class="comment-message"><a href="#" data-action="profile-open" data-id="${esc(c.user_id)}">${esc(author.display_name)}</a><span class="comment-body">${esc(c.body)}</span></div>
 <div class="comment-tools"><time>${esc(fmtTime(c.created_at))}</time>${c.edited_at?'<span class="comment-edited">змінено</span>':''}<button type="button" data-action="comment-reply" data-id="${esc(c.id)}">Відповісти</button>${own?`<button type="button" data-action="comment-edit-open" data-id="${esc(c.id)}">Редагувати</button>`:''}${canDelete?`<button type="button" data-action="comment-delete" data-id="${esc(c.id)}" title="${own?'Видалити свій коментар':'Прибрати коментар зі свого допису'}">Видалити</button>`:''}<button type="button" class="comment-heart ${liked?'is-liked':''}" aria-label="${liked?'Прибрати лайк з коментаря':'Вподобати коментар'}" aria-pressed="${liked}" data-action="comment-like" data-id="${esc(c.id)}">${liked?'♥':'♡'} <span>${likes.length||''}</span></button></div>
 </div></div>${replies.map(r=>renderCommentNode(r,children,Math.min(depth+1,3))).join('')}</div>`;
}
function postMedia(url){const src=imageSrc(url);if(!src)return '';const clean=url.split('?')[0].toLowerCase();if(/\.(mp4|webm)$/.test(clean))return `<video class="post-photo" src="${src}" controls preload="metadata" playsinline></video>`;if(/\.(mp3|m4a)$/.test(clean))return `<audio class="konta-post-audio" src="${src}" controls preload="metadata"></audio>`;return `<img class="post-photo" src="${src}" alt="Фото допису" loading="lazy">`}
function pollCard(postId){
 const poll=state.polls.find(p=>p.post_id===postId);if(!poll)return '';
 const options=state.pollOptions.filter(o=>o.poll_id===poll.id),votes=state.pollVotes.filter(v=>v.poll_id===poll.id);
 const mine=votes.find(v=>v.user_id===me());
 return `<div class="konta-poll"><strong>📊 ${esc(poll.question)}</strong>${options.map(o=>{const count=votes.filter(v=>v.option_id===o.id).length;return `<button type="button" class="konta-poll-option ${mine?.option_id===o.id?'is-voted':''}" data-action="poll-vote" data-id="${esc(o.id)}" ${mine?'disabled':''}>${esc(o.label)} <span>${mine?`${count} голосів (${votes.length?Math.round(count/votes.length*100):0}%)`:''}</span></button>`}).join('')}<small>${votes.length} голосів</small></div>`;
}
function postCard(p){
 const author=byId(p.user_id)||{display_name:'Користувач KONTA',username:'user'};
 const group=p.community_id?state.groups.find(g=>g.id===p.community_id):null;
 const postLikes=state.likes.filter(l=>l.post_id===p.id),liked=postLikes.some(l=>l.user_id===me());
 const comments=state.comments.filter(c=>c.post_id===p.id);
 const children=new Map();for(const c of comments){if(c.parent_id&&comments.some(p=>p.id===c.parent_id)){if(!children.has(c.parent_id))children.set(c.parent_id,[]);children.get(c.parent_id).push(c)}}
 const roots=comments.filter(c=>!c.parent_id||!comments.some(p=>p.id===c.parent_id));
 const expanded=expandedComments.has(p.id);const shown=expanded?roots:[];
 const commentsHtml=shown.map(c=>renderCommentNode(c,children)).join('');
 return `<article class="post" id="post-${esc(p.id)}">
 <div class="post-head">${avatar(author)}<div class="post-identity"><strong data-action="profile-open" data-id="${esc(p.user_id)}">${esc(author.display_name)}${verifiedBadge(author)}</strong><small>@${esc(author.username)} · ${esc(fmtTime(p.created_at))}${group?` · <a href="#" data-action="group-open" data-id="${esc(group.id)}">${esc(group.name)}</a>`:''}</small></div></div>
 ${p.body?`<div class="post-text">${esc(p.body)}</div>`:''}${pollCard(p.id)}${postMedia(p.media_url)}
 <div class="post-actions"><button data-action="post-like" data-id="${esc(p.id)}" class="${liked?'is-liked':''}"><span>${liked?'♥':'♡'}</span>${postLikes.length}</button>${postLikes.length?`<button type="button" data-action="post-likers" data-id="${esc(p.id)}" aria-label="Переглянути, кому сподобався допис">Хто вподобав</button>`:''}<button data-action="comment-focus" data-id="${esc(p.id)}"><span>▢</span>${comments.length} коментарів</button><button data-action="share" data-id="${esc(p.id)}"><span>↗</span>Поділитись</button>${p.user_id===me()?`<button class="post-delete" title="Видалити допис" data-action="post-delete" data-id="${esc(p.id)}">✕</button>`:''}</div>
 <div class="comment-area" ${expanded?'':'hidden'}>${roots.length>3?`<button type="button" class="comment-more" data-action="comment-expand" data-id="${esc(p.id)}">${expanded?'Згорнути коментарі':`Показати всі коментарі (${comments.length})`}</button>`:''}
 ${commentsHtml}<form class="comment-form" data-post-id="${esc(p.id)}"><div class="reply-banner" hidden><span class="reply-caption"></span><button type="button" data-action="comment-reply-cancel" data-id="${esc(p.id)}" aria-label="Скасувати відповідь">×</button></div><div class="comment-form-row">${avatar(state.profile,'sm')}<input name="comment" maxlength="500" required placeholder="Написати коментар..." autocomplete="off"><button type="button" data-action="emoji-comment" data-id="${esc(p.id)}" aria-label="Додати емодзі">😊</button><button type="submit">Надіслати</button></div></form></div></article>`;
}
function empty(title,detail,emoji='♡'){return `<div class="panel"><div class="empty"><span class="empty-emoji">${emoji}</span><strong>${esc(title)}</strong>${esc(detail)}</div></div>`}

// Accessible KONTA emoji grid and friend sharing dialogs.
const KONTA_EMOJIS=['😀','😃','😄','😁','😆','😅','😂','🤣','😊','🙂','😉','😍','🥰','😘','😎','🥳','🤩','😢','😭','🥺','😡','🤔','😴','🤗','👍','👎','👏','🙌','🙏','💪','👋','👌','✌️','❤️','🧡','💛','💚','💙','💜','🖤','💔','🔥','✨','🎉','🎂','🎁','🌹','🌸','🌞','🌙','⭐','💯','💬','💋','🐱','🐶','🍕','☕','🎵','🎮','⚽','🚀','🇺🇦'];
function kontaDialog(title){
 document.querySelector('.konta-ui-backdrop')?.remove();
 const backdrop=document.createElement('div');backdrop.className='konta-ui-backdrop';backdrop.setAttribute('role','presentation');
 const dialog=document.createElement('section');dialog.className='konta-ui-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 const heading=document.createElement('div');heading.className='konta-ui-heading';
 const h=document.createElement('h2');h.textContent=title;
 const close=document.createElement('button');close.type='button';close.className='konta-ui-close';close.textContent='✕';close.setAttribute('aria-label','Закрити');close.onclick=()=>backdrop.remove();
 heading.append(h,close);dialog.append(heading);backdrop.append(dialog);
 backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.remove()});
 const escape=e=>{if(e.key==='Escape')backdrop.remove()};
 document.addEventListener('keydown',escape);
 const originalRemove=backdrop.remove.bind(backdrop);backdrop.remove=()=>{document.removeEventListener('keydown',escape);originalRemove()};
 document.body.append(backdrop);close.focus();return {backdrop,dialog};
}
function openEmojiGrid(input,chat=false){
 if(!input)return;
 const {backdrop,dialog}=kontaDialog('Вибери смайлик');
 const grid=document.createElement('div');grid.className='konta-emoji-grid';
 for(const emoji of KONTA_EMOJIS){const btn=document.createElement('button');btn.type='button';btn.textContent=emoji;btn.setAttribute('aria-label','Вставити '+emoji);
 btn.onclick=()=>{const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;const limit=input.maxLength>0?input.maxLength:2000;
 const value=input.value.slice(0,start)+emoji+input.value.slice(end);if(value.length>limit)return;
 input.value=value;input.selectionStart=input.selectionEnd=start+emoji.length;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));if(chat){messageDrafts.set(state.chatId,input.value);const send=input.closest('form')?.querySelector('button[type="submit"]');if(send)send.disabled=!input.value.trim();}
 backdrop.remove();input.focus()};grid.append(btn)}
 dialog.append(grid);
}
function openFriendShare(post){
 const friends=friendIds().map(uid=>({id:uid,profile:byId(uid)})).sort((a,b)=>(a.profile?.display_name||'').localeCompare(b.profile?.display_name||'','uk'));
 const {backdrop,dialog}=kontaDialog('Поділитися дописом');
 const search=document.createElement('input');search.type='search';search.className='konta-share-search';search.placeholder='Пошук друга за іменем або ніком';search.setAttribute('aria-label','Пошук друга');
 const list=document.createElement('div');list.className='konta-share-list';
 const url=location.origin+location.pathname+'#post='+encodeURIComponent(post.id);
 const status=document.createElement('p');status.className='konta-share-status';status.setAttribute('role','status');
 function draw(){list.replaceChildren();const query=search.value.trim().toLocaleLowerCase('uk-UA');
 const matches=friends.filter(f=>((f.profile?.display_name||'')+' '+(f.profile?.username||'')).toLocaleLowerCase('uk-UA').includes(query));
 if(!matches.length){const empty=document.createElement('p');empty.className='konta-share-empty';empty.textContent=friends.length?'Нікого не знайдено':'Поки немає друзів';list.append(empty)}
 for(const friend of matches){const row=document.createElement('button');row.type='button';row.className='konta-share-person';
 const av=document.createElement('span');av.className='konta-share-avatar';const img=imageSrc(friend.profile?.avatar_url);
 if(img){const photo=document.createElement('img');photo.src=friend.profile.avatar_url;photo.alt='';av.append(photo)}else av.textContent=initials(friend.profile);
 const details=document.createElement('span');details.className='konta-share-person-info';const name=document.createElement('strong');name.textContent=friend.profile?.display_name||'Користувач';if(friend.profile?.is_verified){const mark=document.createElement('span');mark.className='konta-verified';mark.textContent='✓';name.append(mark)}
 const nick=document.createElement('small');nick.textContent='@'+(friend.profile?.username||'konta');details.append(name,nick);
 const action=document.createElement('span');action.textContent='Надіслати';action.className='konta-share-send';
 row.append(av,details,action);row.onclick=async()=>{row.disabled=true;action.textContent='Надсилаємо…';
 const {error}=await db.from('private_messages').insert({sender_id:me(),recipient_id:friend.id,body:'Поділився(-лася) дописом у КОНТА: '+url});
 if(error){status.textContent=errText(error);row.disabled=false;action.textContent='Повторити';return}
 action.textContent='✓ Надіслано';toast('Допис надіслано: '+name.textContent);
 };list.append(row)}}
 search.addEventListener('input',draw);dialog.append(search,list,status);
 const copy=document.createElement('button');copy.type='button';copy.className='konta-share-copy';copy.textContent='🔗 Скопіювати посилання';copy.onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('Посилання скопійовано')}catch(e){status.textContent='Не вдалося скопіювати посилання'}};dialog.append(copy);
 draw();search.focus();
}

function storyStrip(){
 const followed=new Set([...friendIds(),...state.follows.filter(f=>f.follower_id===me()).map(f=>f.followed_id),me()]);
 const visible=state.stories.filter(st=>followed.has(st.user_id)&&new Date(st.expires_at)>new Date());
 const seen=new Set();const unique=visible.filter(st=>{if(seen.has(st.user_id))return false;seen.add(st.user_id);return true});
 return `<section class="konta-stories" aria-label="Історії друзів та підписок"><button type="button" class="konta-story add" data-action="story-create"><span class="story-ring">＋</span><small>Моя історія</small></button>${unique.map(st=>`<button type="button" class="konta-story" data-action="story-view" data-id="${esc(st.id)}"><span class="story-ring">${avatar(byId(st.user_id))}</span><small>${esc((byId(st.user_id)?.display_name||'Користувач').split(' ')[0])}</small></button>`).join('')}${!unique.length?'<span class="story-empty">Історії друзів та підписок з’являться тут</span>':''}</section>`;
}
async function createStory(){
 const picker=document.createElement('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm';picker.onchange=async()=>{
 const file=picker.files?.[0];if(!file)return;
 try{
 if(file.size>15*1024*1024)throw Error('Історія має бути до 15 МБ.');
 if(!['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm'].includes(file.type))throw Error('Оберіть фото або MP4/WebM.');
 toast('Завантажуємо історію...');
 const ext=file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')||'bin';
 const path=`${me()}/story-${crypto.randomUUID()}.${ext}`;
 const {error:uploadError}=await db.storage.from('konta-media').upload(path,file,{contentType:file.type,upsert:false});
 if(uploadError)throw uploadError;
 const url=db.storage.from('konta-media').getPublicUrl(path).data.publicUrl;
 const {error}=await db.from('stories').insert({user_id:me(),media_url:url,media_type:file.type.startsWith('video/')?'video':'image'});
 if(error)throw error;
 await loadAll(true);render();toast('Історію додано на 24 години!');
 }catch(e){toast(errText(e))}
 };picker.click();
}
function showStory(id){
 const st=state.stories.find(x=>x.id===id);if(!st)return;
 const overlay=document.createElement('div');overlay.className='konta-story-overlay';
 const media=st.media_type==='video'?document.createElement('video'):document.createElement('img');
 media.src=st.media_url;media.className='konta-story-media';
 if(st.media_type==='video'){media.controls=true;media.autoplay=true;media.playsInline=true}
 const close=document.createElement('button');close.textContent='✕ Закрити';close.className='konta-story-close';close.onclick=()=>overlay.remove();
 overlay.append(close,media);
 if(st.user_id===me()){const del=document.createElement('button');del.textContent='Видалити історію';del.className='konta-story-delete';del.onclick=async()=>{const {error}=await db.from('stories').delete().eq('id',st.id).eq('user_id',me());if(error){toast(errText(error));return}overlay.remove();await loadAll(true);render()};overlay.append(del)}
 overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};document.body.append(overlay);
}

function viewFeed(){
 let posts=[...state.posts];
 if(state.feedFilter==='friends')posts=posts.filter(p=>friendIds().includes(p.user_id)&&!p.community_id);
 else if(state.feedFilter==='groups')posts=posts.filter(p=>p.community_id);
 else if(state.feedFilter==='mine')posts=posts.filter(p=>p.user_id===me());
 else if(state.feedFilter==='liked')posts=posts.filter(p=>state.likes.some(l=>l.user_id===me()&&l.post_id===p.id));
 const filters=[['all','Усі новини'],['friends','Друзі'],['groups','Спільноти'],['mine','Мої'],['liked','Сподобалося']];
 return `${storyStrip()}${composer()}<div class="panel">${tabs(filters,state.feedFilter,'feed-tab')}</div>${posts.length?posts.map(postCard).join(''):empty('У цій стрічці поки порожньо','Додай друзів, підпишись на спільноти чи створи допис.','✎')}`;
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
 const following=!own&&state.follows.some(f=>f.follower_id===me()&&f.followed_id===uid);
 const followerCount=state.follows.filter(f=>f.followed_id===uid).length;
 const actions=own?`<button class="btn primary small" data-action="profile-edit">Редагувати сторінку</button>`:
 `<button type="button" class="btn ${following?'soft':'primary'} small" data-action="follow-toggle" data-id="${esc(uid)}" aria-pressed="${following}">${following?'✓ Підписаний(-а)':'＋ Підписатися'}</button> ${friendAction(uid)} <button class="btn secondary small" data-action="chat-open" data-id="${esc(uid)}">Повідомлення</button>`;
 const friendGrid=friends.slice(0,6).map(x=>`<button data-action="profile-open" data-id="${esc(x.id)}" title="${esc(x.display_name)}">${avatar(x,'sm')}<span>${esc(x.display_name.split(' ')[0])}</span></button>`).join('');
 const images=photoUrls.map(src=>`<img src="${imageSrc(src)}" loading="lazy" alt="Фото користувача">`).join('');
 return `<div class="profile-classic kp-profile">
 <aside class="profile-classic-rail">
  <div class="panel profile-photo-card">${avatar(p,'lg')}${own?'<button class="btn soft small" data-action="profile-edit">Змінити фотографію</button>':`<button class="btn primary small" data-action="chat-open" data-id="${esc(uid)}">Написати</button>`}</div>
  <div class="panel"><h3 class="classic-section-title">Друзі <span>${friends.length}</span></h3><div class="classic-peek"><div class="classic-friend-grid">${friendGrid||'<span class="subtle">Поки немає друзів</span>'}</div></div></div>
  <div class="panel"><h3 class="classic-section-title">Фотографії <span>${photoUrls.length}</span></h3><div class="classic-peek"><div class="classic-mini-photos">${images||'<span class="subtle">Поки немає фото</span>'}</div></div></div>
 </aside>
 <section class="classic-profile-main">
  <div class="panel profile-summary"><div class="kp-mobile-identity">${avatar(p,'lg')}<div class="kp-mobile-identity-name"><strong>${esc(p.display_name)}${verifiedBadge(p)}</strong><span>@${esc(p.username)}</span>${presenceLabel(p)}</div></div>
   <div class="classic-page-heading"><h1 class="profile-classic-name">${esc(p.display_name)}${verifiedBadge(p)}</h1><span class="kp-handle">@${esc(p.username)}</span>${presenceLabel(p)}<span class="kp-member-pill">✦ У KONTA</span></div>
   <div class="profile-classic-meta"><span>Про себе:</span><strong class="profile-classic-about">${esc(p.bio||'Тут ще немає інформації')}</strong><span>У KONTA:</span><strong>${esc(fmtTime(p.created_at))}</strong></div>
   <div class="profile-classic-actions">${actions}</div>
   <div class="profile-stats"><button ${own?'data-nav="friends"':'type="button" disabled title="Загальна кількість друзів недоступна"'}><b>${own?friends.length:'—'}</b>друзів</button><button ${own?'data-nav="photos"':'type="button" disabled'}><b>${libraryPhotos.length+postPhotos.length}</b>фото</button><button ${own?'data-nav="groups"':'type="button" disabled'}><b>${state.members.filter(x=>x.user_id===uid).length}</b>спільнот</button><button type="button" disabled><b>${followerCount}</b>підписників</button></div>
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
function viewNotifications(){
 const notices=state.notifications,unread=notices.filter(n=>!n.is_read).length;
 const labels={follow:'підписався(-лася) на твою сторінку',friend:'надіслав(-ла) тобі заявку в друзі',like:'вподобав(-ла) твій допис',comment:'прокоментував(-ла) твій допис',message:'написав(-ла) тобі повідомлення'};
 const icons={follow:'✦',friend:'👥',like:'♥',comment:'💬',message:'✉'};
 const title='<div class="kp-notice-header"><div><h1 class="page-title">🔔 Сповіщення</h1><p>'+(unread?unread+' непрочитаних':'Усі сповіщення прочитані')+'</p></div>'+(unread?'<button class="btn soft small" data-action="notice-read">Прочитати всі</button>':'')+'</div>';
 const rows=notices.length?notices.map(n=>{
   const author=byId(n.actor_id);
   return '<button type="button" class="kp-notice-item '+(n.is_read?'':'is-unread')+'" data-action="notice-open" data-id="'+esc(n.id)+'" aria-label="Відкрити сповіщення">'+
     '<span class="kp-notice-avatar">'+avatar(author,'sm')+'<span class="kp-notice-kind">'+(icons[n.kind]||'•')+'</span></span>'+
     '<span class="kp-notice-text"><strong>'+esc(author?.display_name||'Користувач')+'</strong> '+esc(labels[n.kind]||'є новина для тебе')+
     '<small>'+esc(fmtTime(n.created_at))+'</small></span>'+
     (!n.is_read?'<span class="kp-unread-marker" aria-label="Непрочитане"></span>':'')+'<span class="kp-notice-arrow" aria-hidden="true">›</span></button>';
 }).join(''):'<div class="empty">Тут з’являться вподобання, коментарі, повідомлення та заявки в друзі.</div>';
 return title+'<div class="panel kp-notice-list">'+rows+'</div>';
}
function render(){if(!state.user)return;$$('[data-nav]').forEach(n=>n.classList.toggle('is-active',n.dataset.nav===state.view));$$('.bottom-nav [data-nav]').forEach(n=>n.classList.toggle('is-active',n.dataset.nav===state.view));renderSuggestions();const views={feed:viewFeed,profile:viewProfile,friends:viewFriends,explore:viewExplore,photos:viewPhotos,videos:viewVideos,music:viewMusic,settings:viewSettings,bookmarks:viewBookmarks,groups:viewGroups,group:viewGroup,messages:viewMessages,notifications:viewNotifications};$('#main').innerHTML=initialLoadError?setupError():(views[state.view]||viewFeed)();$('#main').dataset.renderedView=state.view;if(state.view==='messages'){$('#messageScroll')?.scrollTo(0,999999)}window.KONTA_CLASSIC?.translateUI?.(); }
function go(view,opts={}){state.view=view;if('userId'in opts)state.profileId=opts.userId;if('chatId'in opts)state.chatId=opts.chatId;if('groupId'in opts)state.groupId=opts.groupId;if('search'in opts){state.search=opts.search;if(view==='explore')schedulePeopleSearch(state.search)}render();if(window.innerWidth<720)window.scrollTo({top:0,behavior:'smooth'})}
function openPost(groupId=null){pendingPoll=null;let pollBtn=$('#kontaPollBtn');if(!pollBtn){pollBtn=document.createElement('button');pollBtn.id='kontaPollBtn';pollBtn.type='button';pollBtn.className='btn secondary small';pollBtn.textContent='📊 Додати опитування';pollBtn.onclick=()=>{const question=prompt('Питання опитування:');if(!question)return;const choices=prompt('Варіанти відповідей через крапку з комою (2–6):','Так;Ні');if(!choices)return;const options=choices.split(';').map(x=>x.trim()).filter(Boolean);if(options.length<2||options.length>6){toast('Потрібно 2–6 варіантів');return}pendingPoll={question:question.slice(0,250),options:options.map(x=>x.slice(0,120))};pollBtn.textContent='📊 Опитування додано ✓'};$('#postText').after(pollBtn)}pollBtn.textContent='📊 Додати опитування';state.postGroupId=groupId;$('#postText').value='';$('#postFile').value='';$('#postFileLabel').textContent='Фото, відео або аудіо до 15 МБ';$('#postPreview').hidden=true;feedback('#postFeedback','');$('#postDialog').showModal()}
function openProfileEditor(){const p=state.profile;if(!p)return;const parts=(p.display_name||'').trim().split(/\s+/);$('#profileName').value=parts.shift()||'';$('#profileSurname').value=parts.join(' ');$('#profileUsername').value=p.username;$('#profileBio').value=p.bio||'';$('#avatarFile').value='';feedback('#profileFeedback','');$('#profileDialog').showModal()}
function verifyFile(file,avatarMode=false){if(!file)return null;const types=avatarMode?['image/png','image/jpeg','image/webp']:['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4'];if(!types.includes(file.type))throw Error('Підтримуються лише JPG, PNG, WebP'+(avatarMode?'':' та GIF')+'.');if(file.size>(avatarMode?8:15)*1024*1024)throw Error('Файл має бути не більше '+(avatarMode?8:15)+' МБ.');return file}
async function uploadImage(file,kind){verifyFile(file,kind==='avatar');const ext=({"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif","video/mp4":"mp4","video/webm":"webm","audio/mpeg":"mp3","audio/mp4":"m4a"})[file.type];const filePath=`${me()}/${kind}-${crypto.randomUUID()}.${ext}`;const {error}=await db.storage.from('konta-media').upload(filePath,file,{contentType:file.type,upsert:false,cacheControl:'3600'});if(error)throw error;const {data}=db.storage.from('konta-media').getPublicUrl(filePath);return data.publicUrl}
async function handleAuthSubmit(ev){ev.preventDefault();if(!db){feedback('#authFeedback','Підключення не налаштоване. Перевір config.js.',true);return}const email=$('#authEmail').value.trim(),password=$('#authPassword').value;setBusy('#authSubmit',true);feedback('#authFeedback','Підключаємось...');try{if(authMode==='signup'){const first=$('#authName').value.trim(),last=$('#authSurname').value.trim();if(!first||!last)throw Error('Ім’я та прізвище обов’язкові.');if(!/^[\p{L}\p{M}][\p{L}\p{M}’'\- ]*$/u.test(first)||!/^[\p{L}\p{M}][\p{L}\p{M}’'\- ]*$/u.test(last))throw Error('Введи коректні ім’я та прізвище.');const name=first+' '+last;const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:name},emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(!data.session)feedback('#authFeedback','Акаунт створено! Перевір пошту та натисни посилання для підтвердження. Потім увійди.');else await signedIn(data.user)}else if(authMode==='reset'){const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;feedback('#authFeedback','Якщо такий email існує, на нього прийде лист для відновлення пароля.')}else{const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;await signedIn(data.user)}}catch(error){feedback('#authFeedback',errText(error),true)}finally{setBusy('#authSubmit',false)}}
async function handlePostSubmit(ev){ev.preventDefault();if(loading)return;loading=true;setBusy('#postSubmit',true);feedback('#postFeedback','Публікуємо...');try{const text=$('#postText').value.trim();const file=$('#postFile').files[0];if(!text&&!file&&!pendingPoll)throw Error('Напиши текст, додай фото або опитування.');const image=file?await uploadImage(file,'post'):null;const {data:created,error}=await db.from('posts').insert({user_id:me(),body:text,media_url:image,community_id:state.postGroupId}).select('id').single();if(error)throw error;if(pendingPoll){const {data:poll,error:pollError}=await db.from('polls').insert({post_id:created.id,question:pendingPoll.question}).select('id').single();if(pollError)throw pollError;const {error:optionsError}=await db.from('poll_options').insert(pendingPoll.options.map(label=>({poll_id:poll.id,label})));if(optionsError)throw optionsError;pendingPoll=null}$('#postDialog').close();if(state.postGroupId)go('group',{groupId:state.postGroupId});else go('feed');await afterChange('Допис опубліковано!')}catch(error){feedback('#postFeedback',errText(error),true)}finally{loading=false;setBusy('#postSubmit',false)}}
async function handleProfileSubmit(ev){ev.preventDefault();if(loading)return;loading=true;setBusy('#profileSubmit',true);feedback('#profileFeedback','Зберігаємо...');try{const first=$('#profileName').value.trim(),last=$('#profileSurname').value.trim(),name=first+' '+last,username=$('#profileUsername').value.trim().toLowerCase(),bio=$('#profileBio').value.trim();if(!/^[a-z0-9_]{3,24}$/.test(username))throw Error('Нікнейм: 3–24 латинські літери, цифри або _.');if(!first||!last)throw Error('Ім’я та прізвище обов’язкові.');if(!/^[\p{L}\p{M}][\p{L}\p{M}’'\- ]*$/u.test(first)||!/^[\p{L}\p{M}][\p{L}\p{M}’'\- ]*$/u.test(last))throw Error('Введи коректні ім’я та прізвище.');const file=$('#avatarFile').files[0];const avatar_url=file?await uploadImage(file,'avatar'):state.profile?.avatar_url||null;const {error}=await db.from('profiles').update({display_name:name,username,bio,avatar_url}).eq('id',me());if(error)throw error;$('#profileDialog').close();await afterChange('Профіль оновлено!')}catch(error){feedback('#profileFeedback',errText(error),true)}finally{loading=false;setBusy('#profileSubmit',false)}}
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


function closeCommentEditors(){
 document.querySelectorAll('.comment-edit-form').forEach(form=>{
  const content=form.closest('.comment-content');
  content?.querySelector('.comment-message')?.removeAttribute('hidden');
  content?.querySelector('.comment-tools')?.removeAttribute('hidden');
  form.remove();
 });
}
function openCommentEditor(id){
 const c=state.comments.find(item=>item.id===id);
 if(!c||c.user_id!==me())return;
 const root=document.getElementById('comment-'+id);
 if(!root)return;
 closeCommentEditors();
 const content=root.querySelector('.comment-line > .comment-content');
 if(!content)return;
 const form=document.createElement('form');
 form.className='comment-edit-form';
 form.dataset.commentId=id;
 form.innerHTML='<textarea name="commentEdit" maxlength="500" rows="3" required aria-label="Редагувати текст коментаря"></textarea><div class="comment-edit-actions"><button class="btn primary small" type="submit">Зберегти</button><button class="btn secondary small" type="button" data-action="comment-edit-cancel" data-id="'+id+'">Скасувати</button></div>';
 form.querySelector('textarea').value=c.body;
 content.querySelector('.comment-message')?.setAttribute('hidden','');
 content.querySelector('.comment-tools')?.setAttribute('hidden','');
 content.appendChild(form);
 form.querySelector('textarea').focus({preventScroll:true});
}
async function submitCommentEdit(form){
 const id=form.dataset.commentId;
 const c=state.comments.find(item=>item.id===id);
 if(!c||c.user_id!==me())return;
 const field=form.querySelector('[name="commentEdit"]');
 const body=field?.value.trim()||'';
 if(!body||body.length>500){toast('Коментар має містити від 1 до 500 символів');field?.focus();return}
 if(body===c.body){closeCommentEditors();return}
 const button=form.querySelector('button[type="submit"]');
 button.disabled=true;
 try{
  const {data,error}=await db.from('comments')
   .update({body,edited_at:new Date().toISOString()})
   .eq('id',id).eq('user_id',me())
   .select('id,body,edited_at').maybeSingle();
  if(error)throw error;
  if(!data)throw Error('Не вдалося змінити коментар. Перевір права доступу.');
  state.comments=state.comments.map(item=>item.id===id?{...item,...data}:item);
  paintPostComments(c.post_id);
  toast('Коментар змінено');
 }catch(error){toast(errText(error));if(document.contains(button))button.disabled=false}
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
 case 'story-create':await createStory();break;
 case 'story-view':showStory(id);break;
 case 'feed-tab':state.feedFilter=id;render();break;
 case 'friends-tab':state.friendsTab=id;render();if(id==='people'&&state.friendSearch)schedulePeopleSearch(state.friendSearch);break;
 case 'comment-focus':{expandedComments.add(id);paintPostComments(id);const area=$('#post-'+id+' .comment-area');if(area)area.hidden=false;area?.querySelector('.comment-form input')?.focus();break}
 case 'comment-expand':{if(expandedComments.has(id))expandedComments.delete(id);else expandedComments.add(id);paintPostComments(id);const area=$('#post-'+id+' .comment-area');if(area)area.hidden=!expandedComments.has(id);break}
 case 'comment-reply':{const comment=state.comments.find(c=>c.id===id);if(!comment)break;expandedComments.add(comment.post_id);paintPostComments(comment.post_id);const form=$(`#post-${comment.post_id} .comment-form`);if(!form)break;form.dataset.parentId=id;$('.reply-banner',form).hidden=false;$('.reply-caption',form).textContent=`Відповідь для ${byId(comment.user_id)?.display_name||'користувача'}`;const input=$('[name="comment"]',form);input.placeholder='Напишіть відповідь...';input.focus();break}
 case 'comment-reply-cancel':{const form=$(`#post-${id} .comment-form`);if(!form)break;delete form.dataset.parentId;$('.reply-banner',form).hidden=true;const input=$('[name="comment"]',form);input.placeholder='Написати коментар...';input.focus();break}
 case 'comment-edit-open':openCommentEditor(id);break;
 case 'comment-edit-cancel':closeCommentEditors();break;
 case 'comment-like':await toggleCommentLike(id);break;
 case 'chat-back':state.chatId=null;state.chatReplyId=null;state.chatEditId=null;render();break;
 case 'chat-reply':{const m=state.messages.find(x=>x.id===id&&(x.sender_id===state.chatId||x.recipient_id===state.chatId));if(!m)break;state.chatReplyId=id;state.chatEditId=null;render();$('#messageForm textarea')?.focus();break}
 case 'chat-edit':{const m=state.messages.find(x=>x.id===id&&x.sender_id===me()&&x.recipient_id===state.chatId);if(!m)break;state.chatEditId=id;state.chatReplyId=null;messageDrafts.set(state.chatId,m.body);render();$('#messageForm textarea')?.focus();break}
 case 'chat-compose-cancel':state.chatReplyId=null;state.chatEditId=null;messageDrafts.delete(state.chatId);render();$('#messageForm textarea')?.focus();break;
 case 'chat-copy':{const m=state.messages.find(x=>x.id===id&&((x.sender_id===me()&&x.recipient_id===state.chatId)||(x.recipient_id===me()&&x.sender_id===state.chatId)));if(!m)break;if(navigator.clipboard){await navigator.clipboard.writeText(m.body);toast('Повідомлення скопійовано');}else toast('Копіювання недоступне у браузері');break}
 case 'chat-delete':{const m=state.messages.find(x=>x.id===id&&x.sender_id===me());if(!m)break;if(!confirm('Видалити своє повідомлення в обох учасників розмови?'))break;const {error}=await db.from('private_messages').delete().eq('id',m.id).eq('sender_id',me());if(error)throw error;if(state.chatEditId===id)state.chatEditId=null;if(state.chatReplyId===id)state.chatReplyId=null;await afterChange('Повідомлення видалено');break}

 case 'emoji-insert':{openEmojiGrid($('#messageForm textarea'),true);break}
 case 'post-find':{const p=state.posts.find(p=>p.id===id);if(p?.community_id)go('group',{groupId:p.community_id});else go('feed');setTimeout(()=>$('#post-'+id)?.scrollIntoView({behavior:'smooth',block:'center'}),80);break}
 case 'share':{const p=state.posts.find(p=>p.id===id);if(p)openFriendShare(p);break}
 case 'post-likers':{const people=state.likes.filter(l=>l.post_id===id).map(l=>byId(l.user_id)?.display_name||'Користувач KONTA');alert(people.length?'Вподобали допис:\n'+people.join('\n'):'Поки немає вподобань');break}
 case 'emoji-comment':{openEmojiGrid($(`#post-${id} .comment-form input`));break}
 case 'poll-vote':{const option=state.pollOptions.find(o=>o.id===id);if(!option)break;const {error}=await db.from('poll_votes').insert({poll_id:option.poll_id,option_id:id,user_id:me()});if(error)throw error;await loadAll(true);render();toast('Голос враховано');break}
 case 'post-like':await togglePostLike(id);break;
 case 'post-delete':{const p=state.posts.find(p=>p.id===id);if(p?.user_id!==me())break;if(!confirm('Видалити цей допис?'))break;const {error}=await db.from('posts').delete().eq('id',id).eq('user_id',me());if(error)throw error;state.posts=state.posts.filter(x=>x.id!==id);document.getElementById('post-'+id)?.remove();toast('Допис видалено');break}
 case 'comment-delete':{
  const c=state.comments.find(item=>item.id===id),post=c?state.posts.find(p=>p.id===c.post_id):null;
  if(!c||(c.user_id!==me()&&post?.user_id!==me()))break;
  if(!confirm(c.user_id===me()?'Видалити свій коментар?':'Видалити коментар під своїм дописом?'))break;
  const {data,error}=await db.from('comments').delete().eq('id',id).select('id').maybeSingle();
  if(error)throw error;
  if(!data)throw Error('Не вдалося видалити коментар. Перевір права доступу.');
  await reloadCommentsForPost(c.post_id,true);
  toast('Коментар видалено');
  break;
 }
 case 'follow-toggle':{
  if(!idOK(id)||id===me())break;
  const following=state.follows.some(f=>f.follower_id===me()&&f.followed_id===id);
  const req=following?db.from('follows').delete().eq('follower_id',me()).eq('followed_id',id):db.from('follows').insert({follower_id:me(),followed_id:id});
  const {error}=await req;
  if(error)throw error;
  await loadAll(true);
  toast(following?'Ти відписався(-лася)':'Тепер ти підписаний(-а)!');
  break;
 }
 case 'friend-add':{if(id===me()||!idOK(id))break;const {error}=await db.from('friendships').insert({requester_id:me(),addressee_id:id,status:'pending'});if(error)throw error;await refreshFriendshipUI();toast('Запит у друзі надіслано!');break}
 case 'friend-accept':{const rec=friendRecord(id);if(!rec||rec.addressee_id!==me())break;const {error}=await db.from('friendships').update({status:'accepted'}).eq('id',rec.id).eq('addressee_id',me());if(error)throw error;await refreshFriendshipUI();toast('Тепер ви друзі!');break}
 case 'friend-remove':{const rec=friendRecord(id);if(!rec)break;const {error}=await db.from('friendships').delete().eq('id',rec.id);if(error)throw error;await refreshFriendshipUI();toast(rec.status==='accepted'?'Видалено з друзів':'Заявку скасовано');break}
 case 'group-join':{if(!idOK(id))break;const {error}=await db.from('community_members').insert({community_id:id,user_id:me()});if(error)throw error;await refreshMembershipUI();toast('Ти вступив(-ла) у спільноту!');break}
 case 'group-leave':{if(!idOK(id))break;const {error}=await db.from('community_members').delete().eq('community_id',id).eq('user_id',me());if(error)throw error;await refreshMembershipUI();toast('Ти вийшов(-ла) зі спільноти');break}
 case 'notice-open':{
   const n=state.notifications.find(item=>item.id===id);
   if(!n)break;
   if(!n.is_read){
     const {error}=await db.from('notifications').update({is_read:true}).eq('id',id).eq('target_id',me());
     if(error)throw error;
     state.notifications=state.notifications.map(item=>item.id===id?{...item,is_read:true}:item);
     renderSuggestions();
   }
   if(n.kind==='message'&&idOK(n.actor_id)){go('messages',{chatId:n.actor_id});break}
   if(n.kind==='friend'){state.friendsTab='requests';go('friends');break}
   if(n.post_id&&idOK(n.post_id)){
     const post=state.posts.find(item=>item.id===n.post_id);
     if(post){
       if(post.community_id)go('group',{groupId:post.community_id});
       else{state.feedFilter='all';go('feed')}
       requestAnimationFrame(()=>document.getElementById('post-'+post.id)?.scrollIntoView({behavior:'smooth',block:'center'}));
     }else{go('notifications');toast('Цей допис уже недоступний')}
     break;
   }
   if(idOK(n.actor_id))go('profile',{userId:n.actor_id});
   else go('notifications');
   break;
  }
  case 'notice-read':{
   if(!state.notifications.some(n=>!n.is_read))break;
   const {error}=await db.from('notifications').update({is_read:true}).eq('target_id',me()).eq('is_read',false);
   if(error)throw error;
   state.notifications=state.notifications.map(n=>({...n,is_read:true}));
   renderSuggestions();render();toast('Сповіщення прочитано');break;
  }
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
 }catch(error){toast(errText(error))}finally{if(document.contains(btn))btn.disabled=!input.value.trim()}
}
function wireEvents(){
 $$('[data-mode]').forEach(button=>button.addEventListener('click',()=>changeAuthMode(button.dataset.mode)));
 $('#forgotBtn').addEventListener('click',()=>changeAuthMode(authMode==='reset'?'login':'reset'));
 $('#authForm').addEventListener('submit',handleAuthSubmit);
 $('#postForm').addEventListener('submit',handlePostSubmit);
 $('#profileForm').addEventListener('submit',handleProfileSubmit);
 $('#groupForm').addEventListener('submit',handleGroupSubmit);
 $('#resetForm').addEventListener('submit',handleResetSubmit);
 $('#postFile').addEventListener('change',event=>{try{const file=verifyFile(event.target.files[0]);if(!file)return;$('#postFileLabel').textContent=`${file.name} (${(file.size/1048576).toFixed(1)} МБ)`;const preview=$('#postPreview');if(file.type.startsWith('image/')){preview.src=URL.createObjectURL(file);preview.hidden=false}else{preview.hidden=true}}catch(error){event.target.value='';feedback('#postFeedback',errText(error),true)}});
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
 document.addEventListener('input',event=>{if(event.target.id==='exploreInput'){state.search=event.target.value;schedulePeopleSearch(state.search)}if(event.target.matches('#messageForm textarea[name="body"]')&&state.chatId){messageDrafts.set(state.chatId,event.target.value);const send=event.target.closest('form')?.querySelector('button[type="submit"]');if(send)send.disabled=!event.target.value.trim()}if(event.target.id==='chatSearch'){const q=event.target.value.trim().toLocaleLowerCase('uk-UA');$('.chat-list-item').forEach(n=>n.hidden=!n.dataset.chatName?.includes(q))}if(event.target.id==='friendsSearchInput'){state.friendSearch=event.target.value;schedulePeopleSearch(state.friendSearch)}});
 document.addEventListener('submit',e=>{if(e.target.matches('.comment-form')){e.preventDefault();submitComment(e.target)}else if(e.target.matches('.comment-edit-form')){e.preventDefault();submitCommentEdit(e.target)}else if(e.target.id==='messageForm'){e.preventDefault();sendMessage(e.target)}});
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
