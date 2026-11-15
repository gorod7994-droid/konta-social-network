import React,{useEffect,useMemo,useState} from 'react';
import {View,Text,ScrollView,Pressable,Image,Alert} from 'react-native';
import {db,showError,displayName,choosePhoto,uploadPhoto,prettyDate} from './core';
import {C,S,Avatar,Btn,Field,Empty} from './ui';

export function People({data,uid,refresh,openProfile,onChat}) {
 const [filter,setFilter]=useState('people'),[q,setQ]=useState(''),[matches,setMatches]=useState([]);
 const friends=data.friends;
 const profiles=useMemo(()=>Object.fromEntries(data.profiles.map(p=>[p.id,p])),[data.profiles]);
 useEffect(()=>{
  const key=q.trim().replace(/[%\\]/g,'').slice(0,60);
  if(key.length<2){setMatches([]);return}
  let active=true;
  const timer=setTimeout(async()=>{
   const [a,b]=await Promise.all([
    db.from('profiles').select('id,username,display_name,bio,avatar_url').ilike('username','%'+key+'%').limit(50),
    db.from('profiles').select('id,username,display_name,bio,avatar_url').ilike('display_name','%'+key+'%').limit(50)
   ]);
   if(active) setMatches([...new Map([...(a.data||[]),...(b.data||[])].map(p=>[p.id,p])).values()]);
  },300);
  return()=>{active=false;clearTimeout(timer)}
 },[q]);
 const record=id=>friends.find(f=>(f.requester_id===uid&&f.addressee_id===id)||(f.addressee_id===uid&&f.requester_id===id));
 async function friendAction(other){
  const r=record(other);
  try{
   if(!r){
    const {error}=await db.from('friendships').insert({requester_id:uid,addressee_id:other,status:'pending'});
    if(error)throw error;
   }else if(r.status==='pending'&&r.addressee_id===uid){
    const {error}=await db.from('friendships').update({status:'accepted'}).eq('id',r.id).eq('addressee_id',uid);
    if(error)throw error;
   }else{
    const {error}=await db.from('friendships').delete().eq('id',r.id);
    if(error)throw error;
   }
   await refresh();
  }catch(e){Alert.alert('Друзі',showError(e))}
 }
 const makeRow=p=>p&&p.id!==uid?<View key={p.id} style={[S.card,S.row]}>
  <Pressable onPress={()=>openProfile(p.id)}><Avatar profile={p} size={51}/></Pressable>
  <Pressable onPress={()=>openProfile(p.id)} style={{flex:1}}><Text style={S.h} numberOfLines={1}>{displayName(p)}</Text><Text style={S.muted}>@{p.username||'konta'}{p.bio?' · '+p.bio.slice(0,22):''}</Text></Pressable>
  <View style={{gap:6}}>
   <Btn small soft label="💬 Чат" onPress={()=>onChat(p.id)}/>
   <Btn small label={!record(p.id)?'+ Друзі':record(p.id).status==='accepted'?'✓ Друзі':record(p.id).addressee_id===uid?'Прийняти':'Очікує'} onPress={()=>friendAction(p.id)} />
  </View>
 </View>:null;
 const requests=friends.filter(f=>f.addressee_id===uid&&f.status==='pending').map(f=>profiles[f.requester_id]).filter(Boolean);
 const accepted=friends.filter(f=>f.status==='accepted').map(f=>profiles[f.requester_id===uid?f.addressee_id:f.requester_id]).filter(Boolean);
 const results=q.trim().length>=2?matches:data.profiles.filter(p=>p.id!==uid);
 return <ScrollView style={S.page} contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
   <Text style={[S.title,{marginBottom:12}]}>Люди та друзі</Text>
   <Field value={q} onChangeText={setQ} placeholder="Пошук за ім'ям або @ніком…" style={{marginBottom:13}} autoCapitalize="none"/>
   <View style={[S.row,{flexWrap:'wrap',marginBottom:8}]}>
    <Btn small label="Знайти людей" soft={filter!=='people'} onPress={()=>setFilter('people')}/>
    <Btn small label={'Друзі · '+accepted.length} soft={filter!=='friends'} onPress={()=>setFilter('friends')}/>
    <Btn small label={'Заявки · '+requests.length} soft={filter!=='requests'} onPress={()=>setFilter('requests')}/>
   </View>
   {filter==='people'?results.filter(p=>p.id!==uid).slice(0,120).map(makeRow):null}
   {filter==='friends'?accepted.map(makeRow):null}
   {filter==='requests'?requests.map(makeRow):null}
   {filter==='friends'&&!accepted.length?<Empty message="Друзів ще немає — знайди знайомих за іменем або ніком."/>:null}
   {filter==='requests'&&!requests.length?<Empty message="Заявок у друзі поки немає."/>:null}
   {filter==='people'&&!results.length?<Empty message="Нікого не знайдено."/>:null}
 </ScrollView>
}

export function Profile({data,uid,userId,refresh,onChat,onBack}) {
 const id=userId||uid, mine=id===uid;
 const p=data.profiles.find(v=>v.id===id);
 const [editing,setEditing]=useState(false),[name,setName]=useState(''),[username,setUsername]=useState(''),[bio,setBio]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{setEditing(false);setName(p?.display_name||'');setUsername(p?.username||'');setBio(p?.bio||'')},[id,p?.display_name,p?.username,p?.bio]);
 const posts=data.posts.filter(v=>v.user_id===id);
 const friends=data.friends.filter(f=>f.status==='accepted'&&(f.requester_id===id||f.addressee_id===id));
 async function save(){
  if(!name.trim()||!/^[a-z0-9_]{3,24}$/.test(username))return Alert.alert('Профіль','Вкажи ім’я та нік латиницею (3–24 символи: a–z, 0–9, _).');
  setBusy(true);try{const {error}=await db.from('profiles').update({display_name:name.trim(),username,bio:bio.slice(0,180)}).eq('id',uid);if(error)throw error;setEditing(false);await refresh()}catch(e){Alert.alert('Профіль',showError(e))}finally{setBusy(false)}
 }
 async function avatar(){
  try{const item=await choosePhoto();if(!item)return;setBusy(true);const url=await uploadPhoto(uid,'avatar',item);const {error}=await db.from('profiles').update({avatar_url:url}).eq('id',uid);if(error)throw error;await refresh()}catch(e){Alert.alert('Аватар',showError(e))}finally{setBusy(false)}
 }
 return <ScrollView style={S.page} contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
   <View style={[S.card,{alignItems:'center',paddingVertical:25}]}>
    <Avatar profile={p} size={90}/>
    <Text style={[S.title,{marginTop:10,textAlign:'center'}]}>{displayName(p)}</Text>
    <Text style={S.muted}>@{p?.username||'konta'}</Text>
    {!!p?.bio&&<Text style={[S.text,{marginTop:12,textAlign:'center'}]}>{p.bio}</Text>}
    <Text style={[S.muted,{marginTop:12}]}>{friends.length} друзів · {posts.length} дописів</Text>
    <View style={[S.row,{marginTop:16}]}>
     {mine?<><Btn small label={editing?'Скасувати':'Редагувати профіль'} onPress={()=>setEditing(!editing)}/><Btn small soft label="Змінити фото" onPress={avatar} disabled={busy}/></>:<><Btn small label="Написати повідомлення" onPress={()=>onChat(id)}/><Btn small soft label="Назад" onPress={onBack}/></>}
    </View>
   </View>
   {mine&&editing?<View style={S.card}>
    <Text style={[S.h,{marginBottom:10}]}>Редагувати профіль</Text>
    <Field placeholder="Ім'я та прізвище" value={name} onChangeText={setName} style={{marginBottom:10}}/>
    <Field placeholder="Нікнейм латиницею" value={username} onChangeText={setUsername} autoCapitalize="none" style={{marginBottom:10}}/>
    <Field placeholder="Розкажи про себе" value={bio} onChangeText={setBio} multiline style={{marginBottom:10}}/>
    <Btn label={busy?'Збереження…':'Зберегти зміни'} disabled={busy} onPress={save}/>
   </View>:null}
   <Text style={[S.h,{marginHorizontal:6,marginBottom:10}]}>Дописи</Text>
   {posts.length?posts.map(post=><View key={post.id} style={S.card}>
    <Text style={S.muted}>{prettyDate(post.created_at)}</Text>
    {!!post.body&&<Text style={[S.text,{marginVertical:8}]}>{post.body}</Text>}
    {!!post.media_url&&/\.(jpg|jpeg|png|webp)(\?|$)/i.test(post.media_url)&&<Image source={{uri:post.media_url}} style={{height:210,width:'100%',borderRadius:12}}/>}
    {mine?<Btn small danger label="Видалити допис" style={{marginTop:8,alignSelf:'flex-start'}} onPress={()=>Alert.alert('Видалити допис?','',[{text:'Ні',style:'cancel'},{text:'Видалити',style:'destructive',onPress:async()=>{const {error}=await db.from('posts').delete().eq('id',post.id).eq('user_id',uid);if(error)Alert.alert('Помилка',showError(error));else refresh()}}])}/>:null}
   </View>):<Empty message="У профілі ще немає дописів."/>}
 </ScrollView>;
}
