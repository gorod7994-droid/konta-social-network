import React,{useState} from 'react';
import {View,Text,ScrollView,Pressable,Image,Alert} from 'react-native';
import {WebView} from 'react-native-webview';
import {db,displayName,prettyDate,showError,photoUrl} from './core';
import {C,S,Avatar,Btn,Field,Empty} from './ui';

export function Notices({data,uid,refresh,onOpen}) {
 const profiles=Object.fromEntries(data.profiles.map(p=>[p.id,p]));
 async function open(n){
  if(!n.is_read){
   const {error}=await db.from('notifications').update({is_read:true}).eq('id',n.id).eq('target_id',uid);
   if(error)Alert.alert('Сповіщення',showError(error));
   await refresh();
  }
  onOpen(n);
 }
 const names={message:'надіслав(-ла) повідомлення',friend:'надіслав(-ла) заявку у друзі',like:'вподобав(-ла) твій допис',comment:'прокоментував(-ла) допис',follow:'підписався(-лася) на тебе'};
 return <ScrollView style={S.page} contentContainerStyle={S.scroll}>
  <Text style={[S.title,{marginBottom:14}]}>Сповіщення</Text>
  {data.notifications.length?data.notifications.map(n=><Pressable key={n.id} onPress={()=>open(n)} style={[S.card,S.row,!n.is_read&&{borderColor:C.blue}]}>
    <Avatar profile={profiles[n.actor_id]}/>
    <View style={{flex:1}}><Text style={S.text}><Text style={{fontWeight:'800'}}>{displayName(profiles[n.actor_id])}</Text> {names[n.kind]||'взаємодіє з твоїм профілем'}</Text><Text style={S.muted}>{prettyDate(n.created_at)}</Text></View>
    {!n.is_read&&<View style={{width:8,height:8,borderRadius:4,backgroundColor:C.blue}}/>}
   </Pressable>):<Empty message="Сповіщень ще немає."/>}
 </ScrollView>
}
export function Groups({data,uid,refresh}) {
 const [active,setActive]=useState(null),[creating,setCreating]=useState(false),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[post,setPost]=useState('');
 const group=data.communities.find(g=>g.id===active);
 const members=data.members.filter(m=>m.community_id===active);
 const member=members.some(m=>m.user_id===uid);
 async function action(fn){try{await fn();await refresh()}catch(e){Alert.alert('Спільноти',showError(e))}}
 async function create(){if(title.trim().length<2)return Alert.alert('Спільнота','Введи назву не коротше 2 символів.');
  await action(async()=>{const {data:g,error}=await db.from('communities').insert({owner_id:uid,name:title.trim(),description:description.trim()}).select('id').single();if(error)throw error;
   const {error:joinError}=await db.from('community_members').insert({community_id:g.id,user_id:uid});if(joinError)throw joinError;
   setActive(g.id);setCreating(false);setTitle('');setDescription('');});
 }
 async function join(){await action(async()=>{
  const q=member?db.from('community_members').delete().eq('community_id',active).eq('user_id',uid):db.from('community_members').insert({community_id:active,user_id:uid});
  const {error}=await q;if(error)throw error;
 })}
 async function send(){if(!post.trim())return;await action(async()=>{const {error}=await db.from('posts').insert({user_id:uid,community_id:active,body:post.trim()});if(error)throw error;setPost('')})}
 const profiles=Object.fromEntries(data.profiles.map(p=>[p.id,p]));
 return <ScrollView style={S.page} contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
  <View style={[S.row,{justifyContent:'space-between',marginBottom:14}]}>
   <Text style={S.title}>{group?group.name:'Спільноти'}</Text><Btn small soft label={group?'‹ Назад':creating?'Скасувати':'+ Створити'} onPress={()=>{if(group)setActive(null);else setCreating(!creating)}}/>
  </View>
  {!group&&creating?<View style={S.card}><Text style={[S.h,{marginBottom:10}]}>Нова спільнота</Text><Field placeholder="Назва" value={title} onChangeText={setTitle} style={{marginBottom:9}}/><Field placeholder="Опис" value={description} onChangeText={setDescription} multiline style={{marginBottom:10}}/><Btn label="Створити спільноту" onPress={create}/></View>:null}
  {!group?data.communities.map(g=><Pressable key={g.id} style={S.card} onPress={()=>setActive(g.id)}>
    <Text style={S.h}>◎ {g.name}</Text><Text style={S.muted}>{g.description||'Спільнота KONTA'}</Text><Text style={{color:C.blue,marginTop:8,fontWeight:'700'}}>Відкрити →</Text>
   </Pressable>):<><View style={S.card}><Text style={S.text}>{group.description||'Спільнота друзів KONTA'}</Text><Text style={[S.muted,{marginVertical:10}]}>{members.length} учасників</Text><Btn label={member?'Вийти зі спільноти':'Приєднатися'} soft={member} onPress={join}/></View>
   {member?<View style={S.card}><Field multiline placeholder="Напиши допис у спільноту…" value={post} onChangeText={setPost} style={{marginBottom:8}}/><Btn label="Опублікувати" onPress={send}/></View>:null}
   {data.posts.filter(p=>p.community_id===active).map(p=><View key={p.id} style={S.card}><Text style={S.h}>{displayName(profiles[p.user_id])}</Text><Text style={S.muted}>{prettyDate(p.created_at)}</Text><Text style={[S.text,{marginTop:8}]}>{p.body}</Text>{photoUrl(p.media_url)?<Image source={{uri:p.media_url}} style={{height:210,borderRadius:12,marginTop:8}}/>:null}</View>)}
  </>}
 </ScrollView>;
}
export function Photos({data,openProfile}) {
 const images=data.posts.filter(p=>photoUrl(p.media_url));
 const profiles=Object.fromEntries(data.profiles.map(p=>[p.id,p]));
 return <ScrollView style={S.page} contentContainerStyle={S.scroll}>
  <Text style={[S.title,{marginBottom:14}]}>Фотографії KONTA</Text>
  {images.length?images.map(p=><View key={p.id} style={S.card}><Pressable onPress={()=>openProfile(p.user_id)}><Text style={[S.h,{marginBottom:8}]}>{displayName(profiles[p.user_id])}</Text></Pressable><Image source={{uri:p.media_url}} resizeMode="cover" style={{height:290,borderRadius:12,width:'100%'}}/><Text style={[S.text,{marginTop:8}]}>{p.body||''}</Text></View>):<Empty message="Фотографій поки немає. Додай фото до допису у стрічці."/ >}
 </ScrollView>;
}
const emptyBoard=()=>Array(9).fill(null);
export function Games() {
 const [game,setGame]=useState(null),[board,setBoard]=useState(emptyBoard()),[turn,setTurn]=useState('❌');
 const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
 const winner=lines.reduce((found,[a,b,c])=>found||(board[a]&&board[a]===board[b]&&board[b]===board[c]?board[a]:null),null);
 function move(i){if(winner||board[i])return;const next=[...board];next[i]=turn;setBoard(next);setTurn(turn==='❌'?'⭕':'❌')}
 if(game==='bottle'||game==='catalog')return <View style={S.page}>
   <View style={[S.row,{padding:10,backgroundColor:C.white}]}><Btn small soft label="‹ До ігор" onPress={()=>setGame(null)}/><Text style={S.h}>{game==='bottle'?'Бутилочка':'Ігри KONTA'}</Text></View>
   <WebView style={{flex:1}} source={{uri:game==='bottle'?'https://konta.pp.ua/games.html?game=bottle':'https://konta.pp.ua/games.html'}} startInLoadingState allowsBackForwardNavigationGestures/>
  </View>;
 return <ScrollView style={S.page} contentContainerStyle={S.scroll}>
  <Text style={[S.title,{marginBottom:14}]}>🎮 Ігри KONTA</Text>
  {!game?<><Pressable style={S.card} onPress={()=>setGame('bottle')}><Text style={S.title}>🍾 Бутилочка онлайн</Text><Text style={S.muted}>Грай із користувачами KONTA, спілкуйся в чаті</Text></Pressable>
    <Pressable style={S.card} onPress={()=>setGame('xo')}><Text style={S.title}>❌⭕ Хрестики-нулики</Text><Text style={S.muted}>Грай удвох на одному телефоні</Text></Pressable>
    <Pressable style={S.card} onPress={()=>setGame('catalog')}><Text style={S.title}>🎲 Усі ігри</Text><Text style={S.muted}>Каталог мініігор KONTA</Text></Pressable></>:<View style={S.card}>
    <View style={[S.row,{justifyContent:'space-between'}]}><Text style={S.h}>Хрестики-нулики</Text><Btn small soft label="Назад" onPress={()=>setGame(null)}/></View>
    <Text style={[S.text,{textAlign:'center',margin:15}]}>{winner?'Перемогли '+winner:board.every(Boolean)?'Нічия':'Хід: '+turn}</Text>
    <View style={{flexDirection:'row',flexWrap:'wrap',width:288,alignSelf:'center'}}>{board.map((cell,i)=><Pressable key={i} onPress={()=>move(i)} style={{width:90,height:90,margin:3,borderRadius:12,backgroundColor:C.pale,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:39}}>{cell}</Text></Pressable>)}</View>
    <Btn label="Нова гра" style={{marginTop:18}} onPress={()=>{setBoard(emptyBoard());setTurn('❌')}}/>
   </View>}
 </ScrollView>;
}
