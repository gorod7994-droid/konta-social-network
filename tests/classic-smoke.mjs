import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const media=fs.readFileSync('media.js','utf8');
const classic=fs.readFileSync('classic.js','utf8');
const css=fs.readFileSync('classic.css','utf8');
const modern=fs.readFileSync('modern.css','utf8');
const searchCSS=fs.readFileSync('search-actions.css','utf8');
const robots=fs.readFileSync('robots.txt','utf8');
const sitemap=fs.readFileSync('sitemap.xml','utf8');
const about=fs.readFileSync('about.html','utf8');
assert.ok(html.includes('<link rel="canonical" href="https://konta.pp.ua/">'),'Missing canonical homepage URL');
assert.ok(html.includes('application/ld+json'),'Missing public structured site data');
assert.ok(html.includes('property="og:title"'),'Missing social-preview metadata');
assert.ok(html.includes('href="/about.html"'),'Missing internal link to public informational page');
assert.ok(about.includes('KONTA — соціальна мережа'),'Public about page is missing descriptive content');
assert.ok(about.includes('https://konta.pp.ua/about.html'),'About page canonical URL missing');
assert.ok(robots.includes('Sitemap: https://konta.pp.ua/sitemap.xml'),'robots.txt sitemap pointer missing');
assert.ok(sitemap.includes('<loc>https://konta.pp.ua/</loc>')&&sitemap.includes('<loc>https://konta.pp.ua/about.html</loc>'),'Sitemap missing public pages');
assert.ok(!/<loc>http:\/\//.test(sitemap)&&!/<loc>https:\/\/www\.konta\.pp\.ua/.test(sitemap),'Sitemap includes non-canonical URLs');


for(const file of ['styles.css?v=9','classic.css?v=9','modern.css?v=9','search-actions.css?v=10','konta-enhancements.css?v=2','app.js?v=13','media.js?v=9','classic.js?v=9']){
 assert.ok(html.includes(file),'Missing asset: '+file);
}
for(const section of ['photos','videos','music','bookmarks','settings']){
 assert.ok(html.includes('data-nav="'+section+'"'),'Missing navigation: '+section);
}
assert.ok(css.includes('html[data-theme="dark"]'),'Missing dark theme');
assert.ok(css.includes('html[data-density="compact"]'),'Missing compact mode');
assert.equal(css.split('{').length,css.split('}').length,'CSS braces mismatch');
assert.equal(modern.split('{').length,modern.split('}').length,'Modern CSS braces mismatch');
assert.ok(modern.includes('html[data-theme="dark"]'),'Modern dark styles missing');
assert.ok(modern.includes('@media (max-width:720px)'),'Mobile styles missing');
assert.ok(modern.includes('prefers-reduced-motion'),'Reduced-motion styles missing');
assert.ok(html.includes('class="header-create"'),'Quick create button missing');
assert.ok(html.includes('id="topSearchResults"'),'Instant search dropdown missing');
assert.ok(html.includes('aria-label="Пошук людей за іменем або ніком"'),'Accessible search missing');
assert.equal(searchCSS.split('{').length,searchCSS.split('}').length,'Search CSS braces mismatch');
assert.ok(searchCSS.includes('html[data-theme="dark"]'),'Missing dark-mode search styles');
assert.ok(app.includes(".ilike('username'"),'Username server search missing');
assert.ok(app.includes(".ilike('display_name'"),'Display-name server search missing');
assert.ok(app.includes("case 'post-like':await togglePostLike(id);break;"),'Post reactions still repaint whole page');
assert.ok(app.includes("case 'comment-like':await toggleCommentLike(id);break;"),'Comment reactions still repaint whole page');
assert.ok(app.includes("showApp(changed)"),'Refresh-diff rendering missing');
assert.ok(!classic.includes('window.render();'),'Settings still re-render the whole page');

const context=vm.createContext({
 window:{innerWidth:1200},
 document:{documentElement:{dataset:{}},querySelector:()=>null,addEventListener:()=>{},querySelectorAll:()=>[]},
 localStorage:{getItem:()=>null,setItem:()=>{}},
 location:{origin:'https://site.example',pathname:'/'},
 navigator:{},
 console,setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},confirm:()=>false
});
const withoutBoot=app.replace(/boot\(\)\.catch\(error=>feedback\('#authFeedback',errText\(error\),true\)\);\s*$/,'');
assert.notEqual(withoutBoot,app,'Could not isolate app boot');
vm.runInContext(withoutBoot,context);
vm.runInContext(media,context);
vm.runInContext(classic,context);
vm.runInContext([
"state.user={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'};",
"state.profile={id:state.user.id,username:'user_one',display_name:'Користувач',created_at:'2026-11-01T09:00:00Z'};",
"state.profiles=[state.profile,{id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',username:'user_two',display_name:'Друг',created_at:'2026-11-02T10:00:00Z'}];",
"state.posts=[{id:'cccccccc-cccc-4ccc-cccc-cccccccccccc',user_id:state.user.id,body:'Тестова новина',created_at:'2026-11-03T10:00:00Z'}];",
"state.likes=[{post_id:state.posts[0].id,user_id:state.user.id}];",
"state.messages=[{id:'dddddddd-dddd-4ddd-dddd-dddddddddddd',sender_id:state.user.id,recipient_id:state.profiles[1].id,body:'Привіт',created_at:'2026-11-10T12:00:00Z'},{id:'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',sender_id:state.profiles[1].id,recipient_id:state.user.id,body:'Відповідь <script>',reply_to:'dddddddd-dddd-4ddd-dddd-dddddddddddd',created_at:'2026-11-10T12:02:00Z'}];",
"state.chatId=state.profiles[1].id;"
].join('\n'),context);

assert.equal(vm.runInContext("cleanPeopleQuery('  @USER_TWO  ')",context),'user_two');
assert.equal(vm.runInContext("matchPeople('@user_two').length",context),1,'Nick search did not find a person');
assert.equal(vm.runInContext("matchPeople('Друг').length",context),1,'Name search did not find a person');
assert.equal(vm.runInContext("matchPeople('NoSuchPerson').length",context),0,'Search ignored the query');
const peopleHtml=vm.runInContext("searchResultsHtml('@user_two')",context);
assert.ok(peopleHtml.includes('@user_two'),'Search does not show nickname');
const chats=vm.runInContext('viewMessages()',context);
for(const action of ['chat-reply','chat-edit','chat-delete','chat-copy']){
 assert.ok(chats.includes('data-action="'+action+'"'),'Missing chat action: '+action);
}
assert.ok(chats.includes('Привіт'),'Missing message text');
assert.ok(chats.includes('chat-quote'),'Missing reply quote');
assert.ok(!chats.includes('<script>'),'Message HTML not escaped');
assert.ok(chats.includes('&lt;script&gt;'),'Escaped message missing');

const profile=vm.runInContext('viewProfile()',context);
assert.ok(profile.includes('profile-classic'),'Missing classic profile');
assert.ok(profile.includes('Стіна'),'Missing profile wall');
assert.ok(!profile.includes('kp-cover'),'Old profile banner still present');
assert.ok(profile.includes('підписників'),'Follower count missing');
vm.runInContext("state.profileId=state.profiles[1].id;",context);
const otherProfile=vm.runInContext('viewProfile()',context);
assert.ok(otherProfile.includes('data-action="follow-toggle"'),'Follow action missing');
vm.runInContext("state.profileId=null;state.notifications=[{id:'f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1',target_id:state.user.id,actor_id:state.profiles[1].id,kind:'follow',is_read:false,created_at:'2026-11-10T12:00:00Z'}]",context);
const alerts=vm.runInContext('viewNotifications()',context);
assert.ok(alerts.includes('підписався(-лася)'),'Follow notification missing');
assert.ok(alerts.includes('data-action="notice-open"'),'Actionable notification missing');
assert.ok(app.includes("case 'follow-toggle':{"),'Follow handling missing');
assert.ok(app.includes("case 'notice-open':{"),'Notification route missing');
const news=vm.runInContext('viewFeed()',context);
assert.ok(news.includes('Спільноти')&&news.includes('Сподобалося'),'Missing news filters');
assert.ok(news.includes('feed-hero'),'Modern welcome card missing');
assert.ok(news.includes('Привіт, Користувач'),'Personalized greeting missing');
const bookmarks=vm.runInContext('viewBookmarks()',context);
assert.ok(bookmarks.includes('Тестова новина'),'Missing liked post');
const settings=vm.runInContext('viewSettings()',context);
for(const expected of ['Мої налаштування','Темна','Компактна','Enter','Змінити пароль']){
 assert.ok(settings.includes(expected),'Missing setting: '+expected);
}
vm.runInContext("window.KONTA_CLASSIC.applyPreferences({theme:'dark',density:'compact',enter_to_send:false,feed_default:'friends'})",context);
assert.equal(context.document.documentElement.dataset.theme,'dark');
assert.equal(context.document.documentElement.dataset.density,'compact');
assert.equal(vm.runInContext('state.preferences.enter_to_send',context),false);

assert.ok(searchCSS.includes('.comment-edit-form'),'Inline edit form CSS missing');
assert.ok(app.includes("case 'comment-edit-open':openCommentEditor(id);break;"),'Edit action missing');
assert.ok(app.includes("case 'comment-delete':{"),'Delete action missing');
assert.ok(app.includes(".update({body,edited_at:new Date().toISOString()})"),'Edited body is not saved');
assert.ok(app.includes(".delete().eq('id',id).select('id').maybeSingle()"),'Delete did not verify affected row');

// Verify permissions shown to comment authors, the owner of a post, and bystanders.
vm.runInContext([
"state.commentLikes=[];",
"state.posts.push({id:'ffffffff-ffff-4fff-ffff-ffffffffffff',user_id:state.profiles[1].id,body:'Другий допис',created_at:'2026-11-03T10:00:00Z'});",
"state.comments=[",
" {id:'10101010-1010-4010-8010-101010101010',post_id:state.posts[0].id,user_id:state.user.id,body:'Мій коментар',created_at:'2026-11-04T10:00:00Z'},",
" {id:'20202020-2020-4020-8020-202020202020',post_id:state.posts[0].id,user_id:state.profiles[1].id,body:'Чужий коментар',created_at:'2026-11-04T10:01:00Z'},",
" {id:'30303030-3030-4030-8030-303030303030',post_id:state.posts[1].id,user_id:state.profiles[1].id,body:'<script>alert(1)</script>',created_at:'2026-11-04T10:02:00Z'}",
"];"
].join('\n'),context);
const mine=vm.runInContext('renderCommentNode(state.comments[0],new Map())',context);
const onMyPost=vm.runInContext('renderCommentNode(state.comments[1],new Map())',context);
const onOtherPost=vm.runInContext('renderCommentNode(state.comments[2],new Map())',context);
assert.ok(mine.includes('data-action="comment-edit-open"'),'Author cannot edit own comment');
assert.ok(mine.includes('data-action="comment-delete"'),'Author cannot delete own comment');
assert.ok(onMyPost.includes('data-action="comment-delete"'),'Post owner cannot moderate a comment');
assert.ok(!onMyPost.includes('data-action="comment-edit-open"'),'Post owner can edit another author');
assert.ok(!onOtherPost.includes('data-action="comment-delete"'),'Bystander can delete another comment');
assert.ok(!onOtherPost.includes('data-action="comment-edit-open"'),'Bystander can edit another comment');
assert.ok(!onOtherPost.includes('<script>'),'Unescaped HTML in comment');
assert.ok(onOtherPost.includes('&lt;script&gt;'),'Comment escaping missing');

console.log('KONTA comment editing and moderation smoke tests passed');

assert.ok(html.includes('id="authSurname"')&&html.includes('id="profileSurname"'),'Required surname fields missing');
assert.ok(app.includes("$('#authSurname').required=mode==='signup'"),'Surname must be required during signup');
assert.ok(app.includes("first+' '+last"),'Full name must be saved');
