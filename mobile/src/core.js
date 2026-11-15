import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';

export const db = createClient(
  'https://mcllgijcbthuobfhigos.supabase.co',
  'sb_publishable__qzTs_OBN4BUe2IEYMCRYg_OHCiXjhM',
  { auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
);
export const initialData = {
  profiles: [], posts: [], likes: [], comments: [], friends: [], messages: [],
  notifications: [], communities: [], members: [], stories: []
};
export const prettyDate = value => {
  const d = new Date(value || 0);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('uk-UA', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
};
export const displayName = p => p?.display_name || p?.username || 'Користувач KONTA';
export const showError = error => {
  const message = error?.message || String(error || 'Невідома помилка');
  if (/Invalid login credentials/i.test(message)) return 'Неправильний email або пароль';
  if (/Email not confirmed/i.test(message)) return 'Спочатку підтверди електронну пошту';
  return message;
};
export async function loadData(uid) {
  const jobs = [
    ['profiles', db.from('profiles').select('id,username,display_name,bio,avatar_url').limit(500)],
    ['posts', db.from('posts').select('id,user_id,community_id,body,media_url,created_at').order('created_at',{ascending:false}).limit(250)],
    ['likes', db.from('likes').select('post_id,user_id').limit(4000)],
    ['comments', db.from('comments').select('id,post_id,user_id,body,created_at,edited_at').order('created_at',{ascending:true}).limit(4000)],
    ['friends', db.from('friendships').select('id,requester_id,addressee_id,status').or('requester_id.eq.' + uid + ',addressee_id.eq.' + uid).limit(500)],
    ['messages', db.from('private_messages').select('id,sender_id,recipient_id,body,created_at,edited_at').or('sender_id.eq.' + uid + ',recipient_id.eq.' + uid).order('created_at',{ascending:false}).limit(600)],
    ['notifications', db.from('notifications').select('id,actor_id,target_id,kind,post_id,is_read,created_at').eq('target_id',uid).order('created_at',{ascending:false}).limit(100)],
    ['communities', db.from('communities').select('id,owner_id,name,description,created_at').order('created_at',{ascending:false}).limit(200)],
    ['members', db.from('community_members').select('community_id,user_id').limit(3000)],
    ['stories', db.from('stories').select('id,user_id,media_url,media_type,created_at').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(90)]
  ];
  const result = await Promise.all(jobs.map(async ([name,q]) => {
    const { data,error } = await q;
    return { name, data:data || [], error };
  }));
  const updated = {}, errors = [];
  for (const row of result) {
    if (row.error) errors.push(row.name + ': ' + row.error.message);
    else updated[row.name] = row.data;
  }
  return { updated, errors };
}
export async function choosePhoto() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Дозволь доступ до фотографій у налаштуваннях iPhone.');
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: false, quality: 0.75, base64: true
  });
  if (picked.canceled) return null;
  const item = picked.assets?.[0];
  if (!item?.base64) throw new Error('Не вдалося прочитати фотографію.');
  if (item.fileSize && item.fileSize > 9 * 1024 * 1024) throw new Error('Фото повинно бути менше 9 МБ.');
  return item;
}
export async function uploadPhoto(uid,kind,item) {
  if (!item?.base64 || !uid) throw new Error('Фотографію не вибрано.');
  const mime = item.mimeType === 'image/png' ? 'image/png' : item.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const path = uid + '/' + kind + '-' + Date.now() + '-' + Math.floor(Math.random()*999999) + '.' + ext;
  const { error } = await db.storage.from('konta-media').upload(path, decode(item.base64), {contentType:mime,upsert:false,cacheControl:'3600'});
  if (error) throw error;
  return db.storage.from('konta-media').getPublicUrl(path).data.publicUrl;
}
export const photoUrl = url => /^https:\/\/.+/i.test(url || '') && !/\.(mp4|webm|mp3|m4a)(\?|$)/i.test(url || '');
