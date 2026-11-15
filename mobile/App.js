import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,ScrollView,SafeAreaView,Pressable,Alert,AppState,KeyboardAvoidingView,Platform} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import {db,initialData,loadData,showError} from './src/core';
import {C,S,Avatar,Btn,Field,Loader} from './src/ui';
import {Feed} from './src/Feed';
import {People,Profile} from './src/People';
import {Messages} from './src/Messages';
import {Notices,Groups,Photos,Games} from './src/Extras';

function Auth() {
 const [mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[first,setFirst]=useState(''),[last,setLast]=useState(''),[busy,setBusy]=useState(false);
 async function submit(){
  if(!email.includes('@'))return Alert.alert('KONTA','Введи коректну електронну пошту.');
  if(mode!=='reset'&&password.length<6)return Alert.alert('KONTA','Пароль повинен містити щонайменше 6 символів.');
  if(mode==='signup'&&(!first.trim()||!last.trim()))return Alert.alert('KONTA','Введи ім’я та прізвище.');
  setBusy(true);
  try{
   if(mode==='reset'){
    const {error}=await db.auth.resetPasswordForEmail(email.trim(),{redirectTo:'https://konta.pp.ua/'});
    if(error)throw error;Alert.alert('Відновлення пароля','Перевір електронну пошту. Посилання для відновлення відкриється на сайті KONTA.');
   }else if(mode==='signup'){
    const {data,error}=await db.auth.signUp({email:email.trim(),password,options:{data:{display_name:first.trim()+' '+last.trim()},emailRedirectTo:'https://konta.pp.ua/'}});
    if(error)throw error;if(!data.session)Alert.alert('Акаунт створено','Перевір пошту для підтвердження, потім увійди в KONTA.');
   }else{
    const {error}=await db.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
   }
  }catch(e){Alert.alert('Помилка входу',showError(e))}finally{setBusy(false)}
 }
 return <KeyboardAvoidingView style={{flex:1,backgroundColor:C.bg}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <ScrollView contentContainerStyle={{flexGrow:1,justifyContent:'center',padding:22}} keyboardShouldPersistTaps="handled">
     <View style={{alignItems:'center',marginBottom:38}}><Text style={{fontSize:48,fontWeight:'900',color:C.blue}}>К KONTA.</Text><Text style={[S.muted,{fontSize:18}]}>Твої люди поруч</Text></View>
     <View style={[S.card,{padding:23,gap:12}]}>
       <Text style={[S.title,{marginBottom:8}]}>{mode==='signup'?'Реєстрація':mode==='reset'?'Забув пароль?':'Увійти в KONTA'}</Text>
       {mode==='signup'?<><Field value={first} onChangeText={setFirst} placeholder="Ім'я"/><Field value={last} onChangeText={setLast} placeholder="Прізвище"/></>:null}
       <Field value={email} onChangeText={setEmail} placeholder="Електронна пошта" keyboardType="email-address" autoCapitalize="none"/>
       {mode!=='reset'?<Field value={password} onChangeText={setPassword} placeholder="Пароль" secureTextEntry/>:null}
       <Btn label={busy?'Зачекай…':mode==='signup'?'Створити акаунт':mode==='reset'?'Відновити пароль':'Увійти'} onPress={submit} disabled={busy}/>
       <Btn soft label={mode==='signup'?'Уже є акаунт? Увійти':mode==='reset'?'Повернутися до входу':'Створити акаунт'} onPress={()=>setMode(mode==='login'?'signup':'login')}/>
       {mode==='login'?<Pressable onPress={()=>setMode('reset')}><Text style={{textAlign:'center',color:C.blue,margin:10}}>Забув пароль?</Text></Pressable>:null}
       <Text style={[S.muted,{textAlign:'center'}]}>Один акаунт для iPhone та сайту konta.pp.ua</Text>
     </View>
   </ScrollView>
 </KeyboardAvoidingView>;
}
const tabItems=[
 {id:'feed',icon:'⌂',name:'Новини'},{id:'people',icon:'♧',name:'Люди'},
 {id:'chat',icon:'✉',name:'Чати'},{id:'games',icon:'🎮',name:'Ігри'},
 {id:'profile',icon:'◉',name:'Я'},{id:'more',icon:'☰',name:'Ще'}
];
function More({open,logout,data}) {
 const unread=data.notifications.filter(n=>!n.is_read).length;
 return <ScrollView style={S.page} contentContainerStyle={S.scroll}>
  <Text style={[S.title,{marginBottom:14}]}>Моя KONTA</Text>
  {[
   ['notices','🔔 Сповіщення'+(unread?' · '+unread:'')],['groups','◎ Спільноти'],
   ['photos','▧ Фотографії'],['site','🌐 Сайт KONTA']
  ].map(([id,label])=><Pressable key={id} onPress={()=>id==='site'?WebBrowser.openBrowserAsync('https://konta.pp.ua/'):open(id)} style={S.card}>
   <Text style={S.h}>{label} <Text style={{color:C.blue}}>›</Text></Text>
  </Pressable>)}
  <View style={S.card}><Text style={[S.h,{marginBottom:10}]}>Мій акаунт</Text>
    <Btn danger label="Вийти з акаунта" onPress={()=>Alert.alert('Вийти з KONTA?','',[{text:'Ні',style:'cancel'},{text:'Вийти',style:'destructive',onPress:logout}])}/>
  </View>
 </ScrollView>;
}
export default function App() {
 const [session,setSession]=useState(null),[boot,setBoot]=useState(true);
 const [data,setData]=useState(initialData),[loading,setLoading]=useState(false),[error,setError]=useState(null);
 const [tab,setTab]=useState('feed'),[moreTab,setMoreTab]=useState(null),[userId,setUserId]=useState(null),[chatId,setChatId]=useState(null);
 const uid=session?.user?.id;
 useEffect(()=>{
  let alive=true;
  db.auth.getSession().then(({data:d})=>{if(alive){setSession(d.session);setBoot(false)}}).catch(e=>{if(alive){setError(showError(e));setBoot(false)}});
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,s)=>{if(alive)setSession(s)});
  return()=>{alive=false;subscription.unsubscribe()};
 },[]);
 const refresh=useCallback(async()=>{
  if(!uid)return;setLoading(true);
  try{
   const {updated,errors}=await loadData(uid);
   setData(prev=>({...prev,...updated}));
   setError(errors.length?errors.slice(0,2).join(' · '):null);
  }catch(e){setError(showError(e))}finally{setLoading(false)}
 },[uid]);
 useEffect(()=>{
  if(!uid){setData(initialData);return}
  refresh();
  const timer=setInterval(()=>{if(AppState.currentState==='active')refresh()},30000);
  return()=>clearInterval(timer);
 },[uid,refresh]);
 function go(next){
  setTab(next);
  if(next!=='more')setMoreTab(null);
  if(next==='profile')setUserId(uid);
  if(next==='chat')setChatId(null);
 }
 const openProfile=id=>{setUserId(id);setTab('profile')};
 const openChat=id=>{setChatId(id);setTab('chat')};
 const openNotice=n=>{
  if(n.kind==='message'&&n.actor_id)openChat(n.actor_id);
  else if(n.kind==='friend')go('people');
  else go('feed');
 };
 const unreads=data.notifications.filter(n=>!n.is_read).length;
 return <SafeAreaView style={{flex:1,backgroundColor:C.white}}>
  <StatusBar style="dark"/>
  {boot?<Loader/>:!session?<Auth/>:<View style={{flex:1,backgroundColor:C.bg}}>
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:C.white,paddingHorizontal:15,paddingVertical:10,borderBottomWidth:1,borderBottomColor:C.line}}>
    <Text style={{fontSize:25,color:C.blue,fontWeight:'900'}}>К KONTA.</Text>
    <View style={S.row}>
      <Pressable onPress={()=>{setTab('more');setMoreTab('notices')}} style={{padding:6}}><Text style={{fontSize:21}}>🔔{unreads?' '+unreads:''}</Text></Pressable>
      <Pressable onPress={refresh} style={{padding:6}}><Text style={{fontSize:22,color:C.blue}}>{loading?'···':'↻'}</Text></Pressable>
    </View>
   </View>
   {error?<Pressable onPress={refresh} style={{backgroundColor:'#fff2e4',paddingHorizontal:12,paddingVertical:6}}><Text style={{color:'#95561e',fontSize:11}}>Помилка оновлення: {error} · натисни, щоб повторити</Text></Pressable>:null}
   <View style={{flex:1}}>
    {tab==='feed'?<Feed data={data} uid={uid} refresh={refresh} openProfile={openProfile}/>:null}
    {tab==='people'?<People data={data} uid={uid} refresh={refresh} openProfile={openProfile} onChat={openChat}/>:null}
    {tab==='chat'?<Messages data={data} uid={uid} chatId={chatId} setChatId={setChatId} refresh={refresh} openProfile={openProfile} openSearch={()=>go('people')}/>:null}
    {tab==='profile'?<Profile data={data} uid={uid} userId={userId||uid} refresh={refresh} onChat={openChat} onBack={()=>go('people')}/>:null}
    {tab==='games'?<Games/>:null}
    {tab==='more'&&!moreTab?<More data={data} open={setMoreTab} logout={()=>db.auth.signOut()}/>:null}
    {tab==='more'&&moreTab==='notices'?<Notices data={data} uid={uid} refresh={refresh} onOpen={openNotice}/>:null}
    {tab==='more'&&moreTab==='groups'?<Groups data={data} uid={uid} refresh={refresh}/>:null}
    {tab==='more'&&moreTab==='photos'?<Photos data={data} openProfile={openProfile}/>:null}
   </View>
   <View style={{flexDirection:'row',backgroundColor:C.white,borderTopWidth:1,borderColor:C.line,paddingTop:8,paddingBottom:4}}>
     {tabItems.map(t=><Pressable key={t.id} onPress={()=>go(t.id)} style={{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:1,minHeight:51}}>
      <Text style={{fontSize:22,color:tab===t.id?C.blue:C.mute}}>{t.icon}</Text>
      <Text numberOfLines={1} style={{fontSize:10,fontWeight:tab===t.id?'900':'600',color:tab===t.id?C.blue:C.mute}}>{t.name}</Text>
     </Pressable>)}
   </View>
  </View>}
 </SafeAreaView>;
}
