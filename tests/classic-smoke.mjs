import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const media=fs.readFileSync('media.js','utf8');
const classic=fs.readFileSync('classic.js','utf8');
const css=fs.readFileSync('classic.css','utf8');

for(const file of ['styles.css?v=7','classic.css?v=7','app.js?v=7','media.js?v=7','classic.js?v=7']){
 assert.ok(html.includes(file),'Missing asset: '+file);
}
for(const section of ['photos','videos','music','bookmarks','settings']){
 assert.ok(html.includes('data-nav="'+section+'"'),'Missing navigation: '+section);
}
assert.ok(css.includes('html[data-theme="dark"]'),'Missing dark theme');
assert.ok(css.includes('html[data-density="compact"]'),'Missing compact mode');
assert.equal(css.split('{').length,css.split('}').length,'CSS braces mismatch');

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
const news=vm.runInContext('viewFeed()',context);
assert.ok(news.includes('Спільноти')&&news.includes('Сподобалося'),'Missing news filters');
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
console.log('KONTA 7 classic smoke tests passed');
