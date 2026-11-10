// KONTA 6.0 media library — independent UI module.
'use strict';
(function(){
const E = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TYPES={photo:['image/jpeg','image/png','image/webp','image/gif'],video:['video/mp4','video/webm'],audio:['audio/mpeg','audio/mp4','audio/ogg']};
const LIMIT={photo:8*1048576,video:40*1048576,audio:15*1048576};
const LABEL={photo:'Фотографії',video:'Відео',audio:'Музика'};
const username=id=>byId(id)?.display_name||'Користувач KONTA';
const albumName=id=>state.albums.find(a=>a.id===id)?.title||'Без альбому';
const url=m=>db.storage.from('konta-library').getPublicUrl(m.storage_path).data.publicUrl;
function mediaCard(m){
 const src=E(url(m));
 const owner=E(username(m.owner_id));
 const ownerLink='<button class="media-author" data-action="profile-open" data-id="'+E(m.owner_id)+'">'+owner+'</button>';
 const mine=m.owner_id===me();
 const info='<div class="media-item-meta"><strong>'+E(m.title)+'</strong><small>'+ownerLink+' · '+E(fmtTime(m.created_at))+'</small>'+(m.caption?'<p>'+E(m.caption)+'</p>':'')+(m.album_id?'<small>Альбом: '+E(albumName(m.album_id))+'</small>':'')+(mine?'<button class="media-delete" data-action="media-delete" data-id="'+E(m.id)+'" aria-label="Видалити файл">Видалити</button>':'')+'</div>';
 if(m.kind==='photo')return '<article class="media-item"><a href="'+src+'" target="_blank" rel="noopener" title="Відкрити фото"><img loading="lazy" src="'+src+'" alt="'+E(m.title)+'"></a>'+info+'</article>';
 if(m.kind==='video')return '<article class="media-item"><video preload="metadata" controls playsinline src="'+src+'"></video>'+info+'</article>';
 return '<article class="media-item audio-item"><div class="audio-icon">♫</div>'+info+'<audio controls preload="none" src="'+src+'"></audio></article>';
}
function render(kind){
 const mineOnly=state.mediaScope==='mine',albumId=state.mediaAlbumId;
 let items=state.library.filter(m=>m.kind===kind&&(!mineOnly||m.owner_id===me()));
 if(kind==='photo'&&albumId)items=items.filter(m=>m.album_id===albumId);
 const mineAlbums=state.albums.filter(a=>a.owner_id===me());
 const selectedAlbum=state.albums.find(a=>a.id===albumId);
 const albums=state.albums.filter(a=>!mineOnly||a.owner_id===me());
 const oldPhotos=kind==='photo'&&!albumId?state.posts.filter(p=>imageSrc(p.media_url)&&(!mineOnly||p.user_id===me())):[];
 const controls='<div class="media-actions"><button class="btn primary small" data-action="media-upload-open" data-id="'+kind+'">＋ Додати '+(kind==='audio'?'аудіо':kind==='video'?'відео':'фото')+'</button>'+(kind==='photo'?'<button class="btn soft small" data-action="media-album-create">＋ Новий альбом</button>':'')+'</div>';
 const tabs='<div class="media-links"><button class="'+(kind==='photo'?'selected':'')+'" data-nav="photos">▧ Фото</button><button class="'+(kind==='video'?'selected':'')+'" data-nav="videos">▷ Відео</button><button class="'+(kind==='audio'?'selected':'')+'" data-nav="music">♫ Музика</button></div>';
 const scope='<div class="media-scope"><button class="'+(!mineOnly?'selected':'')+'" data-action="media-scope" data-id="all">Усі</button><button class="'+(mineOnly?'selected':'')+'" data-action="media-scope" data-id="mine">Мої</button></div>';
 const albumSection=kind==='photo'?'<section class="panel media-albums"><div class="panel-header"><h2>Фотоальбоми</h2><small>'+albums.length+' альбомів</small></div><div class="album-strip"><button class="'+(!albumId?'selected':'')+'" data-action="media-album-filter" data-id="all">Усі фото</button>'+albums.map(a=>'<button class="'+(albumId===a.id?'selected':'')+'" data-action="media-album-filter" data-id="'+E(a.id)+'">'+E(a.title)+'</button>').join('')+'</div>'+(selectedAlbum?.owner_id===me()?'<div class="album-manage"><span>'+E(selectedAlbum.description||'Твій альбом')+'</span><button type="button" data-action="media-album-delete" data-id="'+E(albumId)+'">Видалити альбом</button></div>':'')+'</section>':'';
 const emptyText=kind==='photo'?'Додай фотографії до своєї сторінки.':kind==='video'?'Завантаж своє перше відео.':'Додай музику, на яку маєш права.';
 const previousPhotos=oldPhotos.length?'<section class="panel legacy-gallery"><div class="panel-header"><h2>Фото з дописів</h2></div><div class="photo-grid">'+oldPhotos.map(p=>'<button title="Перейти до допису" data-action="post-find" data-id="'+E(p.id)+'"><img src="'+imageSrc(p.media_url)+'" loading="lazy" alt="Фото з допису"></button>').join('')+'</div></section>':'';
 return '<h1 class="page-title">'+LABEL[kind]+'</h1><section class="panel media-controls">'+tabs+scope+controls+'</section>'+albumSection+'<div class="media-grid media-'+kind+'">'+(items.length?items.map(mediaCard).join(''):'<div class="panel empty-media">Поки немає записів. '+emptyText+'</div>')+'</div>'+previousPhotos+(kind==='photo'&&mineAlbums.length?'<p class="subtle">Альбоми: '+mineAlbums.length+' · Відкривай альбоми, щоб переглянути фотографії.</p>':'');
}
async function action(action,id){
 if(action==='media-upload-open'){
  const kind=TYPES[id]?id:'photo';
  document.querySelector('#mediaUploadKind').value=kind;
  document.querySelector('#mediaUploadTitle').value='';
  document.querySelector('#mediaUploadCaption').value='';
  const file=document.querySelector('#mediaUploadFile');file.value='';
  file.accept=TYPES[kind].join(',');
  const albumSelect=document.querySelector('#mediaUploadAlbum');
  const albumField=document.querySelector('#mediaAlbumField');
  albumField.hidden=kind!=='photo';
  albumSelect.innerHTML='<option value="">Без альбому</option>'+state.albums.filter(a=>a.owner_id===me()).map(a=>'<option value="'+E(a.id)+'">'+E(a.title)+'</option>').join('');
  document.querySelector('#mediaUploadFeedback').textContent='';
  document.querySelector('#mediaUploadDialog').showModal();
  return;
 }
 if(action==='media-album-create'){document.querySelector('#mediaAlbumTitle').value='';document.querySelector('#mediaAlbumDescription').value='';document.querySelector('#mediaAlbumFeedback').textContent='';document.querySelector('#mediaAlbumDialog').showModal();return;}
 if(action==='media-scope'){state.mediaScope=id==='mine'?'mine':'all';state.mediaAlbumId=null;window.render();return;}
 if(action==='media-album-filter'){state.mediaAlbumId=id==='all'?null:id;window.render();return;}
 if(action==='media-album-delete'){
  const album=state.albums.find(a=>a.id===id);if(!album||album.owner_id!==me())return;
  if(!confirm('Видалити альбом? Фото залишаться в розділі «Усі фото».'))return;
  const {error}=await db.from('media_albums').delete().eq('id',id).eq('owner_id',me());if(error)throw error;
  state.mediaAlbumId=null;await loadAll(true);toast('Альбом видалено');return;
 }
 if(action==='media-delete'){
  const item=state.library.find(m=>m.id===id);if(!item||item.owner_id!==me())return;
  if(!confirm('Видалити цей файл з KONTA?'))return;
  const {error}=await db.from('media_library').delete().eq('id',item.id).eq('owner_id',me());
  if(error)throw error;
  const rm=await db.storage.from('konta-library').remove([item.storage_path]);
  if(rm.error)toast('Запис видалено. Файл у сховищі не вдалося очистити.');
  await loadAll(true);toast('Файл видалено');return;
 }
}
async function upload(e){
 e.preventDefault();const btn=document.querySelector('#mediaUploadSubmit');btn.disabled=true;
 const feedback=document.querySelector('#mediaUploadFeedback');feedback.textContent='Завантажуємо файл…';
 let uploadedPath=null;
 try{
  const kind=document.querySelector('#mediaUploadKind').value;
  const file=document.querySelector('#mediaUploadFile').files[0];
  const title=document.querySelector('#mediaUploadTitle').value.trim();
  const caption=document.querySelector('#mediaUploadCaption').value.trim();
  const albumId=kind==='photo'?document.querySelector('#mediaUploadAlbum').value||null:null;
  if(!file||!title)throw Error('Вкажи назву та вибери файл.');
  if(!TYPES[kind]?.includes(file.type))throw Error('Непідтримуваний формат файлу.');
  if(file.size>LIMIT[kind])throw Error('Завеликий файл. Максимум '+Math.round(LIMIT[kind]/1048576)+' МБ.');
  const ext=({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','audio/mpeg':'mp3','audio/mp4':'m4a','audio/ogg':'ogg' })[file.type];
  uploadedPath=me()+'/'+kind+'-'+crypto.randomUUID()+'.'+ext;
  const {error:upError}=await db.storage.from('konta-library').upload(uploadedPath,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
  if(upError)throw upError;
  const {error:dbError}=await db.from('media_library').insert({owner_id:me(),album_id:albumId,kind,title,caption,storage_path:uploadedPath,mime_type:file.type,size_bytes:file.size});
  if(dbError)throw dbError;
  uploadedPath=null;
  document.querySelector('#mediaUploadDialog').close();
  await loadAll(true);
  toast('Файл додано до KONTA!');
 }catch(err){if(uploadedPath)await db.storage.from('konta-library').remove([uploadedPath]);feedback.textContent=errText(err);}
 finally{btn.disabled=false;}
}
async function createAlbum(e){
 e.preventDefault();const btn=document.querySelector('#mediaAlbumSubmit');btn.disabled=true;
 const feedback=document.querySelector('#mediaAlbumFeedback');feedback.textContent='Зберігаємо…';
 try{
  const title=document.querySelector('#mediaAlbumTitle').value.trim(),description=document.querySelector('#mediaAlbumDescription').value.trim();
  if(!title)throw Error('Вкажи назву альбому.');
  const {error}=await db.from('media_albums').insert({owner_id:me(),title,description});if(error)throw error;
  document.querySelector('#mediaAlbumDialog').close();await loadAll(true);toast('Альбом створено!');
 }catch(err){feedback.textContent=errText(err)}finally{btn.disabled=false;}
}
function init(){
 const form=document.querySelector('#mediaUploadForm');
 if(form)form.addEventListener('submit',upload);
 const albumForm=document.querySelector('#mediaAlbumForm');
 if(albumForm)albumForm.addEventListener('submit',createAlbum);
}
window.KONTA_MEDIA={render,action,init};
init();
})();
