import React from 'react';
import { View, Text, Image, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { displayName } from './core';

export const C = {blue:'#3368ee',pale:'#eaf0ff',bg:'#f2f5fc',white:'#ffffff',ink:'#192d4d',mute:'#697b94',line:'#e2e8f2',red:'#d54d59',green:'#159b76'};
export const S = StyleSheet.create({
  page:{flex:1,backgroundColor:C.bg},
  scroll:{padding:14,paddingBottom:30},
  card:{backgroundColor:C.white,borderRadius:18,padding:16,marginBottom:12,borderWidth:1,borderColor:C.line},
  title:{fontSize:23,fontWeight:'900',color:C.ink},
  h:{fontSize:17,fontWeight:'800',color:C.ink},
  text:{fontSize:15,color:C.ink,lineHeight:22},
  muted:{fontSize:13,color:C.mute,lineHeight:20},
  row:{flexDirection:'row',alignItems:'center',gap:10},
  input:{borderColor:'#d7e0f1',borderWidth:1.2,backgroundColor:'#fff',borderRadius:12,padding:12,fontSize:16,color:C.ink,minHeight:46},
  chip:{paddingHorizontal:12,paddingVertical:9,backgroundColor:C.pale,borderRadius:12,marginRight:8,marginBottom:8},
  separator:{height:1,backgroundColor:C.line,marginVertical:12}
});
export function Avatar({profile,size=46}) {
  const url=profile?.avatar_url;
  return url && /^https:\/\//.test(url)
    ? <Image source={{uri:url}} style={{width:size,height:size,borderRadius:size/2,backgroundColor:C.pale}} />
    : <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:'#dfe8ff',alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:size*.43,color:C.blue,fontWeight:'900'}}>{displayName(profile).charAt(0).toUpperCase()}</Text></View>;
}
export function Btn({label,onPress,soft=false,small=false,danger=false,disabled=false,style}) {
  return <Pressable onPress={onPress} disabled={disabled} style={[{backgroundColor:danger?'#ffebed':soft?C.pale:C.blue,paddingVertical:small?9:13,paddingHorizontal:small?12:16,borderRadius:12,alignItems:'center',justifyContent:'center',opacity:disabled?.5:1},style]}>
    <Text style={{color:danger?C.red:soft?C.blue:C.white,fontWeight:'800',fontSize:small?13:15}}>{label}</Text>
  </Pressable>;
}
export function Field({placeholder,value,onChangeText,multiline=false,secureTextEntry=false,keyboardType,style,autoCapitalize}) {
  return <TextInput placeholder={placeholder} placeholderTextColor="#98a6ba" value={value} onChangeText={onChangeText} style={[S.input,multiline&&{minHeight:90,textAlignVertical:'top'},style]} multiline={multiline} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize}/>;
}
export function Empty({message}) {return <View style={{padding:25,alignItems:'center'}}><Text style={[S.muted,{textAlign:'center'}]}>{message}</Text></View>}
export function Loader() {return <View style={{padding:30}}><ActivityIndicator size="large" color={C.blue}/></View>}
