import React,{useEffect,useMemo,useState} from 'react';
import {View,Text,ScrollView,Pressable,Alert,KeyboardAvoidingView,Platform} from 'react-native';
import {db,prettyDate,displayName,showError} from './core';
import {C,S,Avatar,Btn,Field,Empty} from './ui';

export function Messages({data,uid,chatId,setChatId,refresh,openProfile,openSearch}) {
 const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[editId,setEditId]=useState(null);
 const profiles=useMemo(()=>Object.fromEntries(data.profiles.map(p=>[p.id,p])),[data.profiles]);
 const conv=useMemo(()=>{
  const byUser=new Map();
  for(const m of data.messages) {
   const id=m.sender_id===uid?m.recipient_id:m.sender_id;
   if(!byUser.has(id)||m.created_at>byUser.get(id).created_at)byUser.set(id,m);
  }
  return [...byUser].sort((a,b)=>b[1].created_at.localeCompare(a[1].created_at));
 },[data.messages,uid]);
 const list=data.messages.filter(m=>chatId&&(m.sender_id===uid&&m.recipient_id===chatId||m.sender_id===chatId&&m.recipient_id===uid)).sort((a,b)=>a.created_at.localeCompare(b.created_at));
 useEffect(()=>{setDraft('');setEditId(null)},[chatId]);
 const partner=profiles[chatId]||{id:chatId,display_name:chatId?'Користувач KONTA':''};
 async function send(){
  const body=draft.trim();if(!body||!chatId)return;
  setBusy(true);
  try{
   const query=editId?db.from('private_messages').update({body,edited_at:new Date().toISOString()}).eq('id',editId).eq('sender_id',uid)
     :db.from('private_messages').insert({sender_id:uid,recipient_id:chatId,body});
   const {error}=await query;if(error)throw error;setDraft('');setEditId(null);await refresh();
  }catch(e){Alert.alert('Повідомлення',showError(e))}finally{setBusy(false)}
 }
 function actions(m){
  if(m.sender_id!==uid)return;
  Alert.alert('Повідомлення',m.body,[{text:'Скасувати',style:'cancel'},
    {text:'Редагувати',onPress:()=>{setEditId(m.id);setDraft(m.body)}},
    {text:'Видалити',style:'destructive',onPress:async()=>{
     const {error}=await db.from('private_messages').delete().eq('id',m.id).eq('sender_id',uid);
     if(error)Alert.alert('Помилка',showError(error));else refresh();
    }}]);
 }
 return <View style={S.page}>
  {!chatId?<ScrollView contentContainerStyle={S.scroll}>
   <View style={[S.row,{justifyContent:'space-between',marginBottom:14}]}><Text style={S.title}>Повідомлення</Text><Btn small label="+ Новий чат" onPress={openSearch}/></View>
   {conv.length?conv.map(([id,m])=><Pressable key={id} style={[S.card,S.row]} onPress={()=>setChatId(id)}>
      <Avatar profile={profiles[id]} size={50}/>
      <View style={{flex:1}}><Text style={S.h}>{displayName(profiles[id])}</Text><Text style={S.muted} numberOfLines={1}>{m.sender_id===uid?'Ви: ':''}{m.body}</Text><Text style={[S.muted,{fontSize:11}]}>{prettyDate(m.created_at)}</Text></View>
      <Text style={{color:C.blue,fontSize:20}}>›</Text>
    </Pressable>):<Empty message="Поки немає листування. Знайди людину та напиши перше повідомлення."/>}
   </ScrollView>:
   <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={90}>
    <View style={[S.row,{backgroundColor:C.white,padding:12,borderBottomColor:C.line,borderBottomWidth:1}]}>
     <Pressable onPress={()=>setChatId(null)} style={{padding:7}}><Text style={{color:C.blue,fontSize:22}}>‹</Text></Pressable>
     <Pressable onPress={()=>openProfile(chatId)}><Avatar profile={partner} size={42}/></Pressable>
     <Pressable onPress={()=>openProfile(chatId)} style={{flex:1}}><Text style={S.h}>{displayName(partner)}</Text><Text style={S.muted}>Особистий чат</Text></Pressable>
     <Btn small soft label="↻" onPress={refresh}/>
    </View>
    <ScrollView style={{flex:1}} contentContainerStyle={{padding:14,flexGrow:1,justifyContent:'flex-end'}} keyboardShouldPersistTaps="handled">
     {list.length?list.map(m=><Pressable key={m.id} onLongPress={()=>actions(m)} style={{maxWidth:'83%',alignSelf:m.sender_id===uid?'flex-end':'flex-start',backgroundColor:m.sender_id===uid?'#dce8ff':'#fff',padding:12,borderRadius:15,marginBottom:9,borderWidth:1,borderColor:C.line}}>
       <Text style={S.text}>{m.body}</Text>
       <Text style={[S.muted,{fontSize:10,textAlign:'right'}]}>{prettyDate(m.created_at)}{m.edited_at?' · ред.':''}</Text>
      </Pressable>):<Empty message="Тут ще немає повідомлень. Почни розмову!"/>}
    </ScrollView>
    {editId?<Text style={{paddingHorizontal:16,color:C.blue}}>Редагування повідомлення · натисни «Скасувати», щоб повернутись</Text>:null}
    <View style={[S.row,{paddingHorizontal:12,paddingVertical:11,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.line}]}>
     <Field placeholder="Повідомлення…" value={draft} onChangeText={setDraft} multiline style={{flex:1,minHeight:42,maxHeight:110}}/>
     {editId?<Btn small soft label="✕" onPress={()=>{setEditId(null);setDraft('')}}/>:null}
     <Btn small label={busy?'…':'➤'} onPress={send} disabled={busy||!draft.trim()}/>
    </View>
   </KeyboardAvoidingView>}
 </View>;
}
