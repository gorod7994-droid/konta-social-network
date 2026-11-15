import React,{useMemo,useState} from 'react';
import {View,Text,Image,ScrollView,FlatList,Pressable,Alert,Modal} from 'react-native';
import {db,prettyDate,displayName,choosePhoto,uploadPhoto,showError,photoUrl} from './core';
import {C,S,Avatar,Btn,Field,Empty} from './ui';

export function Feed({data,uid,refresh,openProfile}) {
 const [draft,setDraft]=useState(''),[picture,setPicture]=useState(null),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(null),[story,setStory]=useState(null);
 const profiles=useMemo(()=>Object.fromEntries(data.profiles.map(p=>[p.id,p])),[data.profiles]);
 async function act(task) {try{await task();await refresh()}catch(e){Alert.alert('KONTA',showError(e))}}
 async function selectPhoto(){try{setPicture(await choosePhoto())}catch(e){Alert.alert('Фото',showError(e))}}
 async function create(){if(!draft.trim()&&!picture)return;setBusy(true);try{
  const url=picture?await uploadPhoto(uid,'post',picture):null;
  const {error}=await db.from('posts').insert({user_id:uid,body:draft.trim(),media_url:url,community_id:null});
  if(error)throw error;setDraft('');setPicture(null);await refresh();
 }catch(e){Alert.alert('Публікація',showError(e))}finally{setBusy(false)}}
 async function addStory(){try{
  const item=await choosePhoto();if(!item)return;
  const url=await uploadPhoto(uid,'story',item);
  const {error}=await db.from('stories').insert({user_id:uid,media_url:url,media_type:'image'});
  if(error)throw error;await refresh();
 }catch(e){Alert.alert('Історія',showError(e))}}
 const header=<View>
  <View style={S.card}>
    <Text style={[S.h,{marginBottom:10}]}>Що нового?</Text>
    <Field placeholder="Поділися моментом із друзями…" value={draft} onChangeText={setDraft} multiline style={{marginBottom:10}}/>
    {picture?<Pressable onPress={()=>setPicture(null)}><Image source={{uri:picture.uri}} style={{width:'100%',height:190,borderRadius:12,marginBottom:10}}/><Text style={[S.muted,{marginBottom:8}]}>✕ Прибрати фото</Text></Pressable>:null}
    <View style={[S.row,{justifyContent:'space-between'}]}>
      <Btn soft small label="▧ Додати фото" onPress={selectPhoto}/>
      <Btn small disabled={busy||(!draft.trim()&&!picture)} label={busy?'Зачекай…':'Опублікувати'} onPress={create}/>
    </View>
  </View>
  <View style={S.card}>
    <View style={[S.row,{justifyContent:'space-between',marginBottom:8}]}><Text style={S.h}>Історії друзів</Text><Btn soft small label="+ Історія" onPress={addStory}/></View>
    {data.stories.length?<ScrollView horizontal showsHorizontalScrollIndicator={false}>{data.stories.map(st=><Pressable key={st.id} onPress={()=>setStory(st)} style={{width:80,marginRight:9,alignItems:'center'}}><Avatar profile={profiles[st.user_id]} size={58}/><Text style={[S.muted,{marginTop:4}]} numberOfLines={1}>{displayName(profiles[st.user_id])}</Text></Pressable>)}</ScrollView>:<Text style={S.muted}>Поки немає історій. Додай першу!</Text>}
  </View>
  <Text style={[S.h,{marginHorizontal:6,marginBottom:12}]}>Стрічка новин</Text>
 </View>;
 return <View style={{flex:1}}><FlatList style={S.page} contentContainerStyle={S.scroll} data={data.posts} keyExtractor={p=>p.id} ListHeaderComponent={header}
  ListEmptyComponent={<Empty message="Поки немає дописів. Напиши перший!"/>}
  onRefresh={refresh} refreshing={busy}
  renderItem={({item:p})=><Post post={p} uid={uid} me={profiles} likes={data.likes.filter(x=>x.post_id===p.id)} comments={data.comments.filter(x=>x.post_id===p.id)} expanded={expanded===p.id} toggleExpanded={()=>setExpanded(expanded===p.id?null:p.id)} onProfile={openProfile} act={act}/>}
  />
  <Modal visible={!!story} transparent animationType="fade" onRequestClose={()=>setStory(null)}>
    <View style={{flex:1,backgroundColor:'#111827f2',padding:16,justifyContent:'center'}}>
      <Btn soft label="✕ Закрити історію" onPress={()=>setStory(null)} style={{marginBottom:14}}/>
      {story?.media_type==='image'?<Image resizeMode="contain" source={{uri:story?.media_url}} style={{height:'75%',width:'100%'}}/>:<Text style={{color:'#fff',textAlign:'center'}}>Це відеоісторія. Її можна переглянути на сайті KONTA.</Text>}
    </View>
  </Modal>
 </View>;
}
export function Post({post,uid,me,likes,comments,expanded,toggleExpanded,onProfile,act}) {
 const [body,setBody]=useState(''),[editing,setEditing]=useState(null),[editBody,setEditBody]=useState('');
 const author=me[post.user_id],mine=post.user_id===uid,liked=likes.some(l=>l.user_id===uid);
 async function toggleLike(){await act(async()=>{
  const q=liked?db.from('likes').delete().eq('post_id',post.id).eq('user_id',uid):db.from('likes').insert({post_id:post.id,user_id:uid});
  const {error}=await q;if(error)throw error;
 })}
 async function createComment(){if(!body.trim())return;await act(async()=>{
  const {error}=await db.from('comments').insert({post_id:post.id,user_id:uid,body:body.trim()});
  if(error)throw error;setBody('');
 })}
 async function saveComment(id){if(!editBody.trim())return;await act(async()=>{
  const {error}=await db.from('comments').update({body:editBody.trim(),edited_at:new Date().toISOString()}).eq('id',id).eq('user_id',uid);
  if(error)throw error;setEditing(null);
 })}
 function deleteComment(c){Alert.alert('Видалити коментар?','',[
  {text:'Скасувати',style:'cancel'},{text:'Видалити',style:'destructive',onPress:()=>act(async()=>{const {error}=await db.from('comments').delete().eq('id',c.id).eq('user_id',uid);if(error)throw error;})}
 ])}
 function deletePost(){Alert.alert('Видалити допис?','',[
  {text:'Скасувати',style:'cancel'},{text:'Видалити',style:'destructive',onPress:()=>act(async()=>{const {error}=await db.from('posts').delete().eq('id',post.id).eq('user_id',uid);if(error)throw error;})}
 ])}
 return <View style={S.card}>
  <View style={[S.row,{marginBottom:12}]}>
    <Pressable onPress={()=>onProfile(post.user_id)}><Avatar profile={author}/></Pressable>
    <Pressable onPress={()=>onProfile(post.user_id)} style={{flex:1}}><Text style={S.h}>{displayName(author)}</Text><Text style={S.muted}>{prettyDate(post.created_at)}</Text></Pressable>
    {mine?<Btn small soft label="Видалити" onPress={deletePost}/>:null}
  </View>
  {!!post.body&&<Text style={[S.text,{marginBottom:12}]}>{post.body}</Text>}
  {post.media_url&&photoUrl(post.media_url)?<Image source={{uri:post.media_url}} resizeMode="cover" style={{width:'100%',height:260,borderRadius:12,backgroundColor:C.pale,marginBottom:10}}/>:null}
  <View style={[S.row,{marginTop:4}]}>
    <Btn small soft label={(liked?'❤️':'♡')+' '+likes.length} onPress={toggleLike}/>
    <Btn small soft label={'💬 '+comments.length} onPress={toggleExpanded}/>
  </View>
  {expanded?<View style={{marginTop:14,borderTopWidth:1,borderTopColor:C.line,paddingTop:12}}>
    {comments.length===0?<Text style={S.muted}>Коментарів ще немає</Text>:comments.map(c=><View key={c.id} style={{marginBottom:13}}>
      <View style={S.row}>
        <Pressable onPress={()=>onProfile(c.user_id)}><Avatar size={31} profile={me[c.user_id]}/></Pressable>
        <View style={{flex:1}}>
          <Text style={{color:C.ink,fontWeight:'700'}}>{displayName(me[c.user_id])}</Text>
          {editing===c.id?<View style={{gap:6}}><Field value={editBody} onChangeText={setEditBody} multiline/><Btn small label="Зберегти" onPress={()=>saveComment(c.id)}/><Btn small soft label="Скасувати" onPress={()=>setEditing(null)}/></View>:<Text style={S.text}>{c.body}</Text>}
          <Text style={S.muted}>{prettyDate(c.created_at)}{c.edited_at?' · ред.':''}</Text>
        </View>
      </View>
      {c.user_id===uid&&editing!==c.id?<View style={[S.row,{marginTop:5,marginLeft:42}]}><Pressable onPress={()=>{setEditing(c.id);setEditBody(c.body)}}><Text style={{color:C.blue}}>Редагувати</Text></Pressable><Pressable onPress={()=>deleteComment(c)}><Text style={{color:C.red}}>Видалити</Text></Pressable></View>:null}
    </View>)}
    <Field value={body} onChangeText={setBody} placeholder="Напиши коментар…" multiline style={{marginBottom:8}}/>
    <Btn small label="Надіслати коментар" onPress={createComment} disabled={!body.trim()}/>
  </View>:null}
 </View>;
}
